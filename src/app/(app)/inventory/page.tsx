import Link from 'next/link';
import type { Metadata } from 'next';
import { ShieldAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MetricCard } from '@/components/shared/metric-card';
import { PageHeader, Section } from '@/components/shared/page-header';
import { EmptyState, UnavailableState, WarningNote } from '@/components/shared/states';
import { CapabilityBadge } from '@/components/shared/status-badges';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth, tenantWhere } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { INVENTORY_STRATEGY_LABELS, type InventoryStrategy } from '@/lib/enums';
import { formatNumber, formatRelativeTime, titleCase } from '@/lib/utils';

export const metadata: Metadata = { title: 'Inventory' };
export const dynamic = 'force-dynamic';

export default async function InventoryPage() {
  const auth = await requireAuthOrRedirect('/inventory');
  const scope = scopeFromAuth(auth);

  const stores = await prisma.storeConnection.findMany({
    where: { ...tenantWhere(scope), deletedAt: null },
    select: { id: true, name: true, countryCode: true },
  });
  const storeIds = stores.map((store) => store.id);

  const [records, byStatus, byStrategy] = await Promise.all([
    prisma.inventoryRecord.findMany({
      where: { organisationId: scope.organisationId, connectionId: { in: storeIds } },
      orderBy: [{ status: 'asc' }, { quantity: 'asc' }],
      take: 300,
      include: { connection: { select: { id: true, name: true } } },
    }),
    prisma.inventoryRecord.groupBy({
      by: ['status'],
      where: { organisationId: scope.organisationId, connectionId: { in: storeIds } },
      _count: { _all: true },
    }),
    prisma.inventoryRecord.groupBy({
      by: ['strategy', 'connectionId'],
      where: { organisationId: scope.organisationId, connectionId: { in: storeIds } },
      _count: { _all: true },
      _sum: { quantity: true },
    }),
  ]);

  const statusCount = (status: string) =>
    byStatus.find((entry) => entry.status === status)?._count._all ?? 0;

  const total = byStatus.reduce((sum, entry) => sum + entry._count._all, 0);
  const storeNames = new Map(stores.map((store) => [store.id, store.name]));

  const strategyByStore = new Map<string, { strategy: string; count: number; units: number }>();
  for (const entry of byStrategy) {
    const existing = strategyByStore.get(entry.connectionId);
    strategyByStore.set(entry.connectionId, {
      strategy: entry.strategy,
      count: (existing?.count ?? 0) + entry._count._all,
      units: (existing?.units ?? 0) + (entry._sum.quantity ?? 0),
    });
  }

  return (
    <>
      <PageHeader
        title="Inventory"
        breadcrumbs={[{ label: 'Commerce' }, { label: 'Inventory' }]}
        description="Stock levels, thresholds and the inventory strategy in force for each store."
      />

      <WarningNote className="mb-6">
        <span className="font-medium">Independent stores do not share physical stock.</span> Each store&rsquo;s
        quantities are its own unless an external system such as an ERP or OMS is the source of truth. This
        platform will never copy a quantity from one store into another as if it were the same inventory.
      </WarningNote>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Tracked records" value={formatNumber(total)} />
        <MetricCard label="In stock" value={formatNumber(statusCount('IN_STOCK'))} tone="success" />
        <MetricCard
          label="Low stock"
          value={formatNumber(statusCount('LOW'))}
          tone={statusCount('LOW') > 0 ? 'warning' : 'default'}
        />
        <MetricCard
          label="Out of stock"
          value={formatNumber(statusCount('OUT_OF_STOCK'))}
          tone={statusCount('OUT_OF_STOCK') > 0 ? 'destructive' : 'default'}
        />
      </div>

      <Section
        title="Inventory strategy by store"
        description="How this platform treats each store's stock. The strategy determines whether a write is even considered."
      >
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Store</TableHead>
                <TableHead>Strategy</TableHead>
                <TableHead className="text-right">Tracked SKUs</TableHead>
                <TableHead className="text-right">Total units</TableHead>
                <TableHead>What this means</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...strategyByStore.entries()].map(([connectionId, entry]) => (
                <TableRow key={connectionId}>
                  <TableCell>
                    <Link href={`/stores/${connectionId}`} className="font-medium hover:underline">
                      {storeNames.get(connectionId) ?? 'Unknown store'}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" size="sm">
                      {INVENTORY_STRATEGY_LABELS[entry.strategy as InventoryStrategy] ?? entry.strategy}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular text-right">{formatNumber(entry.count)}</TableCell>
                  <TableCell className="tabular text-right">{formatNumber(entry.units)}</TableCell>
                  <TableCell className="max-w-md">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {STRATEGY_EXPLANATIONS[entry.strategy as InventoryStrategy] ?? '—'}
                    </p>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </Section>

      <Section title="Stock levels">
        {records.length === 0 ? (
          <EmptyState
            title="No inventory captured"
            description="Run an inventory sync against the stores in scope."
            action={{ label: 'Open the Sync Centre', href: '/sync' }}
          />
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Safety</TableHead>
                  <TableHead className="text-right">Buffer</TableHead>
                  <TableHead className="text-right">Threshold</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>
                      <Link
                        href={`/catalog/${encodeURIComponent(record.sku)}`}
                        className="font-medium hover:underline"
                      >
                        {record.productName ?? record.sku}
                      </Link>
                      <p className="font-mono text-xs text-muted-foreground">{record.sku}</p>
                    </TableCell>
                    <TableCell>
                      <Link href={`/stores/${record.connectionId}`} className="text-sm hover:underline">
                        {record.connection.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {record.locationName ?? '—'}
                    </TableCell>
                    <TableCell className="tabular text-right font-medium">
                      {formatNumber(record.quantity)}
                    </TableCell>
                    <TableCell className="tabular text-right text-muted-foreground">
                      {record.safetyStock}
                    </TableCell>
                    <TableCell className="tabular text-right text-muted-foreground">{record.buffer}</TableCell>
                    <TableCell className="tabular text-right text-muted-foreground">
                      {record.lowStockThreshold}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          record.status === 'OUT_OF_STOCK'
                            ? 'destructive'
                            : record.status === 'LOW'
                              ? 'warning'
                              : 'success'
                        }
                        size="sm"
                      >
                        {titleCase(record.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{record.dataSource}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatRelativeTime(record.externalUpdatedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </Section>

      <UnavailableState
        title="Inventory writes are not enabled in this release"
        reason={
          <>
            Adjusting stock changes what customers can buy, and a mistaken bulk write is very hard to undo. The
            capability is registered as <CapabilityBadge status="NOT_IMPLEMENTED" showIcon={false} /> until the
            write path has been verified per store, an approval policy is in place, and every target has been
            confirmed to own its own stock rather than mirroring an external system.
          </>
        }
        icon={ShieldAlert}
        docsHref="https://docs.bigcommerce.com/api-reference/store-management/inventory"
      />
    </>
  );
}

const STRATEGY_EXPLANATIONS: Record<InventoryStrategy, string> = {
  INDEPENDENT:
    'This store owns its stock outright. Nothing is copied in or out, and comparison against other stores is informational only.',
  MASTER_SOURCE:
    'A designated master store holds the authoritative quantity and this store follows it. Only meaningful where the same physical stock genuinely serves both.',
  COPIED_SNAPSHOT:
    'Quantities were copied once as a starting point. The two have been free to diverge ever since.',
  EXTERNAL_SYSTEM:
    'An external ERP or OMS is the source of truth. This platform reports quantities read-only and never writes them.',
  READ_ONLY_REPORTING: 'Quantities are shown for reporting only. Writes are disabled for this store.',
  SHARED_POLICY_LOCAL_QTY:
    'Thresholds and safety-stock policy are shared across stores, but each store keeps its own quantities.',
};
