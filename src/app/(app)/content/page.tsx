import Link from 'next/link';
import type { Metadata } from 'next';
import { Rocket } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MetricCard } from '@/components/shared/metric-card';
import { PageHeader, Section } from '@/components/shared/page-header';
import { EmptyState, InfoNote, UnavailableState } from '@/components/shared/states';
import { CapabilityBadge, ContentStatusBadge, HealthDot } from '@/components/shared/status-badges';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth, tenantWhere } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { CONTENT_TYPE_LABELS, type ContentType } from '@/lib/enums';
import { CAPABILITY_DEFINITIONS } from '@/lib/commerce/capability-registry';
import { RESOURCE_CATEGORY_META } from '@/lib/resource-categories';
import { countryFlag, formatNumber, formatRelativeTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Content' };
export const dynamic = 'force-dynamic';

export default async function ContentPage() {
  const auth = await requireAuthOrRedirect('/content');
  const scope = scopeFromAuth(auth);

  const stores = await prisma.storeConnection.findMany({
    where: { ...tenantWhere(scope), deletedAt: null },
    orderBy: [{ hierarchyMode: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, countryCode: true, healthStatus: true, hierarchyMode: true },
  });
  const storeIds = stores.map((store) => store.id);

  const [content, byStatus, byType] = await Promise.all([
    prisma.contentSnapshot.findMany({
      where: { organisationId: scope.organisationId, connectionId: { in: storeIds } },
      orderBy: [{ contentType: 'asc' }, { contentKey: 'asc' }],
      include: { connection: { select: { id: true, name: true, countryCode: true } } },
    }),
    prisma.contentSnapshot.groupBy({
      by: ['status'],
      where: { organisationId: scope.organisationId, connectionId: { in: storeIds } },
      _count: { _all: true },
    }),
    prisma.contentSnapshot.groupBy({
      by: ['contentType'],
      where: { organisationId: scope.organisationId, connectionId: { in: storeIds } },
      _count: { _all: true },
    }),
  ]);

  const count = (status: string) => byStatus.find((entry) => entry.status === status)?._count._all ?? 0;

  // Pages compared across stores, keyed by content key.
  const pages = content.filter((item) => item.contentType === 'PAGE');
  const pageKeys = [...new Set(pages.map((page) => page.contentKey))].sort();
  const master = stores.find((store) => store.hierarchyMode === 'MASTER');

  return (
    <>
      <PageHeader
        title="Content"
        breadcrumbs={[{ label: 'Experience' }, { label: 'Content' }]}
        description="Pages, widgets, banners, scripts and redirects across every store, with their publication state."
        actions={
          <Button size="sm" asChild>
            <Link href="/deployments/new?category=PAGES">
              <Rocket className="h-4 w-4" aria-hidden />
              Plan a content deployment
            </Link>
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Content items" value={formatNumber(content.length)} />
        <MetricCard label="Published" value={formatNumber(count('PUBLISHED'))} tone="success" />
        <MetricCard label="Scheduled" value={formatNumber(count('SCHEDULED'))} />
        <MetricCard label="Draft" value={formatNumber(count('DRAFT'))} />
        <MetricCard
          label="Local overrides"
          value={formatNumber(content.filter((item) => item.isOverride).length)}
          tooltip="Content a store deliberately manages itself rather than inheriting."
        />
      </div>

      <InfoNote className="mb-6">
        In a Multi-Storefront store, pages, widgets and redirects carry a channel id, so they genuinely can
        differ per storefront. Across independent stores nothing is shared — copying content between them
        creates new records with new ids.
      </InfoNote>

      <Section
        title="Page coverage across stores"
        description={
          master
            ? `Compared against ${master.name}. A gap means the page does not exist in that store.`
            : 'No master store is configured, so this is a plain coverage view.'
        }
      >
        {pageKeys.length === 0 ? (
          <EmptyState title="No pages captured" description="Run a content sync to capture pages." />
        ) : (
          <Card>
            <div className="overflow-x-auto thin-scrollbar">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 z-10 min-w-[12rem] bg-background">Page</TableHead>
                    {stores.map((store) => (
                      <TableHead key={store.id} className="min-w-[8rem]">
                        <Link href={`/stores/${store.id}`} className="flex items-center gap-1 hover:underline">
                          <HealthDot status={store.healthStatus} />
                          <span aria-hidden>{countryFlag(store.countryCode)}</span>
                          <span className="truncate">{store.name}</span>
                        </Link>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageKeys.map((key) => (
                    <TableRow key={key}>
                      <TableCell className="sticky left-0 z-10 bg-background">
                        <code className="font-mono text-xs font-medium">{key}</code>
                      </TableCell>
                      {stores.map((store) => {
                        const item = pages.find(
                          (page) => page.contentKey === key && page.connectionId === store.id,
                        );
                        if (!item) {
                          return (
                            <TableCell key={store.id}>
                              <span className="text-xs text-muted-foreground">Absent</span>
                            </TableCell>
                          );
                        }
                        return (
                          <TableCell key={store.id}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="space-y-0.5">
                                  <ContentStatusBadge status={item.status} />
                                  {item.isOverride ? (
                                    <Badge variant="warning" size="sm">
                                      Override
                                    </Badge>
                                  ) : null}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>{item.title}</TooltipContent>
                            </Tooltip>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}
      </Section>

      <Section title="All content" description={byType.map((entry) => `${CONTENT_TYPE_LABELS[entry.contentType as ContentType] ?? entry.contentType}: ${entry._count._all}`).join(' · ')}>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Store</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Published</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {content.slice(0, 250).map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <p className="font-medium">{item.title}</p>
                    {item.isOverride ? (
                      <Badge variant="warning" size="sm" className="mt-0.5">
                        Local override
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" size="sm">
                      {CONTENT_TYPE_LABELS[item.contentType as ContentType] ?? item.contentType}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {item.connection ? (
                      <Link href={`/stores/${item.connectionId}`} className="text-sm hover:underline">
                        {item.connection.name}
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">Organisation-wide</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <code className="font-mono text-xs text-muted-foreground">{item.contentKey}</code>
                  </TableCell>
                  <TableCell>
                    <ContentStatusBadge status={item.status} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{item.scopeLevel}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {item.scheduledFor
                      ? `Scheduled ${formatRelativeTime(item.scheduledFor)}`
                      : formatRelativeTime(item.publishedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        {content.length > 250 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Showing the first 250 of {formatNumber(content.length)} items.
          </p>
        ) : null}
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <UnavailableState
          title="Navigation is not a BigCommerce resource"
          reason={RESOURCE_CATEGORY_META.NAVIGATION.note}
          docsHref="https://docs.bigcommerce.com/docs/storefront/themes"
        />
        <UnavailableState
          title="Content writes are not enabled"
          reason={
            <>
              <CapabilityBadge status="NOT_IMPLEMENTED" showIcon={false} />{' '}
              {CAPABILITY_DEFINITIONS['pages.manage'].unavailableReason} Copying scripts in particular can
              double-count analytics or breach local consent rules, so it warns loudly even once enabled.
            </>
          }
          docsHref="https://docs.bigcommerce.com/api-reference/store-management/pages"
        />
      </div>
    </>
  );
}
