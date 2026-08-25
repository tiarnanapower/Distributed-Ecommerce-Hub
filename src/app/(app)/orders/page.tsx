import type { Metadata } from 'next';

import { MetricCard } from '@/components/shared/metric-card';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, InfoNote } from '@/components/shared/states';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth, tenantWhere } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { aggregateByCurrency, formatMoney, money } from '@/lib/money';
import { formatNumber } from '@/lib/utils';
import { OrdersTable, type OrderRow } from './orders-table';

export const metadata: Metadata = { title: 'Orders' };
export const dynamic = 'force-dynamic';

const PAGE_LIMIT = 500;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const auth = await requireAuthOrRedirect('/orders');
  const scope = scopeFromAuth(auth);
  const params = await searchParams;

  const stores = await prisma.storeConnection.findMany({
    where: {
      ...tenantWhere(scope),
      deletedAt: null,
      ...(params.store ? { id: params.store } : {}),
    },
    select: { id: true, name: true },
  });
  const storeIds = stores.map((store) => store.id);

  const orders = await prisma.orderSnapshot.findMany({
    where: { organisationId: scope.organisationId, connectionId: { in: storeIds } },
    orderBy: { placedAt: 'desc' },
    take: PAGE_LIMIT,
    include: {
      connection: { select: { id: true, name: true } },
      channel: { select: { name: true } },
    },
  });

  const rows: OrderRow[] = orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    storeId: order.connectionId,
    storeName: order.connection.name,
    channelName: order.channel?.name ?? null,
    statusLabel: order.statusLabel,
    statusCategory: order.statusCategory,
    paymentStatus: order.paymentStatus,
    fulfilmentStatus: order.fulfilmentStatus,
    refundStatus: order.refundStatus,
    currencyCode: order.currencyCode,
    grandTotal: order.grandTotal,
    refundedTotal: order.refundedTotal,
    itemCount: order.itemCount,
    customerName: order.customerName,
    customerEmailMasked: order.customerEmailMasked,
    countryCode: order.countryCode,
    paymentMethod: order.paymentMethod,
    orderSource: order.orderSource,
    placedAt: order.placedAt,
  }));

  // Totals are kept per currency — never summed across them.
  const totals = aggregateByCurrency(rows.map((row) => money(row.grandTotal, row.currencyCode)));
  const refunded = rows.filter((row) => row.refundStatus !== 'none').length;

  return (
    <>
      <PageHeader
        title="Orders"
        breadcrumbs={[{ label: 'Commerce' }, { label: 'Orders' }]}
        description={`Orders across ${formatNumber(stores.length)} store${stores.length === 1 ? '' : 's'}, attributed to their store and storefront.`}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Orders shown"
          value={formatNumber(rows.length)}
          hint={rows.length === PAGE_LIMIT ? `Most recent ${PAGE_LIMIT}` : undefined}
        />
        <MetricCard
          label="Currencies"
          value={formatNumber(totals.currencies.length)}
          hint={totals.currencies.join(', ')}
          tooltip="Order totals are held in the currency the order was placed in and are never added across currencies."
        />
        <MetricCard
          label="With refunds"
          value={formatNumber(refunded)}
          higherIsBetter={false}
          tone={refunded > 0 ? 'warning' : 'default'}
        />
        <MetricCard
          label="Value by currency"
          value={
            totals.currencies.length === 0
              ? '—'
              : totals.currencies
                  .slice(0, 2)
                  .map((currency) => formatMoney(totals.byCurrency.get(currency)!, { compact: true }))
                  .join(' · ')
          }
          hint={totals.currencies.length > 2 ? `and ${totals.currencies.length - 2} more` : undefined}
          tooltip="Shown per currency deliberately. A single blended figure would require conversion, which happens only on the analytics pages and is labelled there."
        />
      </div>

      <InfoNote className="mb-6">
        Order status changes and refunds are deliberately not automated here. They dispatch customer emails, move
        real money and cannot be undone, so each order links out to the BigCommerce control panel instead.
      </InfoNote>

      {rows.length === 0 ? (
        <EmptyState
          title="No orders captured yet"
          description="Order snapshots are pulled from BigCommerce by a sync job. Run one for the stores in scope, or widen the store selector."
          action={{
            label: 'Pull orders',
            href: params.store ? `/sync?action=orders&targets=${params.store}` : '/sync?action=orders',
          }}
        />
      ) : (
        <OrdersTable orders={rows} />
      )}
    </>
  );
}
