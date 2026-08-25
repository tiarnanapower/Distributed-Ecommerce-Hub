import Link from 'next/link';
import type { Metadata } from 'next';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MetricCard } from '@/components/shared/metric-card';
import { PageHeader, Section } from '@/components/shared/page-header';
import { EmptyState, UnavailableState } from '@/components/shared/states';
import { CapabilityBadge, HealthDot } from '@/components/shared/status-badges';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth, tenantWhere } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { CAPABILITY_DEFINITIONS } from '@/lib/commerce/capability-registry';
import { countryFlag, formatDate, formatNumber, titleCase } from '@/lib/utils';

export const metadata: Metadata = { title: 'Promotions' };
export const dynamic = 'force-dynamic';

export default async function PromotionsPage() {
  const auth = await requireAuthOrRedirect('/promotions');
  const scope = scopeFromAuth(auth);

  const stores = await prisma.storeConnection.findMany({
    where: { ...tenantWhere(scope), deletedAt: null },
    select: { id: true, name: true },
  });

  const promotions = await prisma.promotionSnapshot.findMany({
    where: { organisationId: scope.organisationId, connectionId: { in: stores.map((s) => s.id) } },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
    include: { connection: { select: { id: true, name: true, countryCode: true, healthStatus: true } } },
  });

  const active = promotions.filter((promotion) => promotion.status === 'ACTIVE').length;
  const scheduled = promotions.filter((promotion) => promotion.status === 'SCHEDULED').length;
  const withCoupons = promotions.filter((promotion) => promotion.couponCode).length;

  // Group by promotion name to show which stores run the same promotion.
  const byName = new Map<string, typeof promotions>();
  for (const promotion of promotions) {
    byName.set(promotion.name, [...(byName.get(promotion.name) ?? []), promotion]);
  }

  return (
    <>
      <PageHeader
        title="Promotions"
        breadcrumbs={[{ label: 'Commerce' }, { label: 'Promotions' }]}
        description="Promotions and coupons across every store in scope, with their channel assignment and usage."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Promotions" value={formatNumber(promotions.length)} />
        <MetricCard label="Active" value={formatNumber(active)} tone="success" />
        <MetricCard label="Scheduled" value={formatNumber(scheduled)} />
        <MetricCard label="With a coupon code" value={formatNumber(withCoupons)} />
      </div>

      <Section title="Run across stores" description="The same promotion name appearing in several stores.">
        {byName.size === 0 ? (
          <EmptyState title="No promotions" description="No promotion snapshots exist for the stores in scope." />
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Promotion</TableHead>
                  <TableHead>Stores running it</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Coupon</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead className="text-right">Uses</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...byName.entries()].map(([name, entries]) => {
                  const reference = entries[0]!;
                  const totalUses = entries.reduce((sum, entry) => sum + entry.usageCount, 0);
                  return (
                    <TableRow key={name}>
                      <TableCell>
                        <p className="font-medium">{name}</p>
                        <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                          {reference.discountSummary}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {entries.map((entry) => (
                            <Link key={entry.id} href={`/stores/${entry.connectionId}`}>
                              <Badge variant="secondary" size="sm" className="gap-1">
                                <HealthDot status={entry.connection.healthStatus} />
                                <span aria-hidden>{countryFlag(entry.connection.countryCode)}</span>
                                {entry.connection.name}
                              </Badge>
                            </Link>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="muted" size="sm">
                          {titleCase(reference.promotionType)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {reference.couponCode ? (
                          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                            {reference.couponCode}
                          </code>
                        ) : (
                          <span className="text-xs text-muted-foreground">Automatic</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {reference.startsAt ? formatDate(reference.startsAt) : '—'}
                        {reference.endsAt ? ` → ${formatDate(reference.endsAt)}` : ' → open-ended'}
                      </TableCell>
                      <TableCell className="tabular text-right">{formatNumber(totalUses)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </Section>

      <Section title="All promotions by store">
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Store</TableHead>
                <TableHead>Promotion</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Redemption</TableHead>
                <TableHead className="text-right">Uses</TableHead>
                <TableHead className="text-right">Limit</TableHead>
                <TableHead>Local id</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {promotions.map((promotion) => (
                <TableRow key={promotion.id}>
                  <TableCell>
                    <Link href={`/stores/${promotion.connectionId}`} className="text-sm hover:underline">
                      {promotion.connection.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">{promotion.name}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        promotion.status === 'ACTIVE'
                          ? 'success'
                          : promotion.status === 'SCHEDULED'
                            ? 'info'
                            : promotion.status === 'EXPIRED'
                              ? 'muted'
                              : 'secondary'
                      }
                      size="sm"
                    >
                      {titleCase(promotion.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {titleCase(promotion.redemptionType)}
                  </TableCell>
                  <TableCell className="tabular text-right">{formatNumber(promotion.usageCount)}</TableCell>
                  <TableCell className="tabular text-right text-muted-foreground">
                    {promotion.usageLimit ? formatNumber(promotion.usageLimit) : '—'}
                  </TableCell>
                  <TableCell>
                    <code className="font-mono text-xs text-muted-foreground">
                      {promotion.externalPromotionId ?? '—'}
                    </code>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </Section>

      <UnavailableState
        title="Copying promotions between stores is not enabled"
        reason={
          <>
            <CapabilityBadge status="NOT_IMPLEMENTED" showIcon={false} />{' '}
            {CAPABILITY_DEFINITIONS['promotions.manage'].unavailableReason} Promotion rules reference store-local
            product, category and customer-group ids, so a copy that looks correct can silently apply to the
            wrong products in the target store. Only promotions whose rules round-trip without loss would ever be
            copied.
          </>
        }
        docsHref="https://docs.bigcommerce.com/api-reference/store-management/promotions"
      />
    </>
  );
}
