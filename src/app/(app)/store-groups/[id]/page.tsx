import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { GitCompareArrows, Rocket } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MetricCard } from '@/components/shared/metric-card';
import { PageHeader, Section } from '@/components/shared/page-header';
import { InfoNote } from '@/components/shared/states';
import { HealthBadge, HealthDot } from '@/components/shared/status-badges';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { assertTenantAccess, scopeFromAuth } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { storeMetrics } from '@/server/services/connections';
import { aggregateByCurrency, formatMoney, money } from '@/lib/money';
import { countryFlag, formatNumber, formatRelativeTime, titleCase } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const group = await prisma.storeGroup.findUnique({ where: { id }, select: { name: true } });
  return { title: group?.name ?? 'Store group' };
}

export default async function StoreGroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuthOrRedirect(`/store-groups/${id}`);
  const scope = scopeFromAuth(auth);

  const group = await prisma.storeGroup.findUnique({
    where: { id },
    include: {
      company: { select: { name: true } },
      members: {
        include: {
          connection: {
            include: {
              company: { select: { name: true } },
              region: { select: { name: true } },
              _count: { select: { products: true, conflictsAsTarget: true } },
            },
          },
        },
      },
    },
  });

  if (!group) notFound();
  assertTenantAccess(group, scope, 'store group');

  const stores = group.members.map((member) => member.connection);
  const totals = aggregateByCurrency(
    stores.map((store) => {
      const metrics = storeMetrics(store.metricsJson);
      return money(metrics.revenue, metrics.currencyCode);
    }),
  );
  const memberIds = stores.map((store) => store.id).join(',');

  const openConflicts = await prisma.conflict.count({
    where: {
      organisationId: scope.organisationId,
      targetConnectionId: { in: stores.map((store) => store.id) },
      status: { in: ['OPEN', 'ACKNOWLEDGED'] },
    },
  });

  return (
    <>
      <PageHeader
        title={group.name}
        breadcrumbs={[
          { label: 'Estate' },
          { label: 'Store Groups', href: '/store-groups' },
          { label: group.name },
        ]}
        description={group.description ?? undefined}
        meta={
          <>
            <Badge variant="secondary">{titleCase(group.purpose)}</Badge>
            <Badge variant="muted">{group.company?.name ?? 'Organisation-wide'}</Badge>
          </>
        }
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/conflicts?stores=${memberIds}`}>
                <GitCompareArrows className="h-4 w-4" aria-hidden />
                Compare members
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href={`/deployments/new?targets=${memberIds}`}>
                <Rocket className="h-4 w-4" aria-hidden />
                Deploy to this group
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Member stores" value={formatNumber(stores.length)} />
        <MetricCard
          label="Healthy"
          value={formatNumber(stores.filter((store) => store.healthStatus === 'HEALTHY').length)}
          tone="success"
        />
        <MetricCard
          label="Open conflicts"
          value={formatNumber(openConflicts)}
          tone={openConflicts > 0 ? 'warning' : 'default'}
        />
        <MetricCard
          label="Revenue (30d)"
          value={
            totals.currencies.length === 0
              ? '—'
              : totals.currencies
                  .map((currency) => formatMoney(totals.byCurrency.get(currency)!, { compact: true }))
                  .join(' · ')
          }
          tooltip="Shown per currency. Groups can span markets, so a blended total would need conversion."
        />
      </div>

      <InfoNote className="mb-6">
        Selecting this group as a deployment target expands to its {stores.length} member store
        {stores.length === 1 ? '' : 's'}. Each is still evaluated individually for capability, health and
        inheritance mode.
      </InfoNote>

      <Section title="Members">
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Store</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Health</TableHead>
                <TableHead className="text-right">Products</TableHead>
                <TableHead className="text-right">Revenue (30d)</TableHead>
                <TableHead>Last sync</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stores.map((store) => {
                const metrics = storeMetrics(store.metricsJson);
                return (
                  <TableRow key={store.id}>
                    <TableCell>
                      <Link
                        href={`/stores/${store.id}`}
                        className="flex items-center gap-1.5 font-medium hover:underline"
                      >
                        <HealthDot status={store.healthStatus} />
                        <span aria-hidden>{countryFlag(store.countryCode)}</span>
                        {store.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{store.company.name}</TableCell>
                    <TableCell className="text-muted-foreground">{store.region?.name ?? '—'}</TableCell>
                    <TableCell>{store.currencyCode}</TableCell>
                    <TableCell>
                      <HealthBadge status={store.healthStatus} />
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {formatNumber(store._count.products)}
                    </TableCell>
                    <TableCell className="tabular text-right font-medium">
                      {formatMoney(money(metrics.revenue, metrics.currencyCode), { compact: true })}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatRelativeTime(store.lastSuccessfulSyncAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </Section>
    </>
  );
}
