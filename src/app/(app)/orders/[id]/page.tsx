import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Ban, CreditCard, ExternalLink, Package, Truck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatRow } from '@/components/shared/metric-card';
import { PageHeader, Section } from '@/components/shared/page-header';
import { UnavailableState } from '@/components/shared/states';
import { CapabilityBadge, DataSourceBadge } from '@/components/shared/status-badges';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { assertTenantAccess, scopeFromAuth } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { CAPABILITY_DEFINITIONS } from '@/lib/commerce/capability-registry';
import { formatMoneyString } from '@/lib/money';
import { countryFlag, formatDateTime, formatNumber, titleCase } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const order = await prisma.orderSnapshot.findUnique({ where: { id }, select: { orderNumber: true } });
  return { title: order ? `Order ${order.orderNumber}` : 'Order' };
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuthOrRedirect(`/orders/${id}`);
  const scope = scopeFromAuth(auth);

  const order = await prisma.orderSnapshot.findUnique({
    where: { id },
    include: {
      lines: true,
      events: { orderBy: { occurredAt: 'asc' } },
      connection: {
        select: {
          id: true,
          name: true,
          controlPanelUrl: true,
          isDemo: true,
          countryCode: true,
          capabilities: {
            where: {
              capabilityKey: { in: ['orders.update_status', 'orders.create_refund', 'orders.read_transactions'] },
            },
            select: { capabilityKey: true, status: true, unavailableReason: true },
          },
        },
      },
      channel: { select: { name: true, siteUrl: true } },
    },
  });

  if (!order) notFound();
  assertTenantAccess(order, scope, 'order');

  const capability = (key: string) =>
    order.connection.capabilities.find((entry) => entry.capabilityKey === key);

  const statusCapability = capability('orders.update_status');
  const refundCapability = capability('orders.create_refund');

  return (
    <>
      <PageHeader
        title={`Order ${order.orderNumber}`}
        breadcrumbs={[
          { label: 'Commerce' },
          { label: 'Orders', href: '/orders' },
          { label: order.orderNumber },
        ]}
        description={
          <span className="flex flex-wrap items-center gap-x-2">
            <Link href={`/stores/${order.connectionId}`} className="hover:underline">
              <span aria-hidden className="mr-1">
                {countryFlag(order.countryCode ?? order.connection.countryCode)}
              </span>
              {order.connection.name}
            </Link>
            {order.channel ? <>· {order.channel.name}</> : null}· Placed {formatDateTime(order.placedAt)}
          </span>
        }
        meta={
          <>
            <Badge
              variant={
                order.statusCategory === 'FULFILLED'
                  ? 'success'
                  : order.statusCategory === 'CANCELLED'
                    ? 'muted'
                    : order.statusCategory === 'REFUNDED'
                      ? 'warning'
                      : 'info'
              }
            >
              {order.statusLabel}
            </Badge>
            <DataSourceBadge source={order.isDemo ? 'DEMO' : 'LIVE'} />
          </>
        }
        actions={
          order.connection.controlPanelUrl ? (
            <Button variant="outline" size="sm" asChild>
              <a
                href={`${order.connection.controlPanelUrl}/orders?viewId=${order.externalOrderId}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
                Open in BigCommerce
              </a>
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <Package className="h-4 w-4" aria-hidden />
                Products ({formatNumber(order.lines.length)})
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit price</TableHead>
                    <TableHead className="text-right">Line total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>
                        <Link
                          href={`/catalog/${encodeURIComponent(line.sku)}`}
                          className="font-medium hover:underline"
                        >
                          {line.name}
                        </Link>
                        <p className="font-mono text-xs text-muted-foreground">{line.sku}</p>
                        {line.variantLabel ? (
                          <p className="text-xs text-muted-foreground">{line.variantLabel}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="tabular text-right">{line.quantity}</TableCell>
                      <TableCell className="tabular text-right">
                        {formatMoneyString(line.unitPrice, order.currencyCode)}
                      </TableCell>
                      <TableCell className="tabular text-right font-medium">
                        {formatMoneyString(line.lineTotal, order.currencyCode)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Timeline</CardTitle>
              <CardDescription>
                Recorded events for this order. Nothing here is editable from this platform.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-l pl-5">
                {order.events.map((event) => (
                  <li key={event.id} className="relative">
                    <span
                      className="absolute -left-[1.4rem] top-1.5 h-2 w-2 rounded-full bg-primary"
                      aria-hidden
                    />
                    <p className="text-sm font-medium">{event.label}</p>
                    {event.detail ? (
                      <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{event.detail}</p>
                    ) : null}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDateTime(event.occurredAt)}
                      {event.actor ? ` · ${event.actor}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          {order.staffNotes ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Staff notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">{order.staffNotes}</p>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Totals</CardTitle>
              <CardDescription>In {order.currencyCode}, the order&rsquo;s own currency.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <StatRow label="Subtotal" value={formatMoneyString(order.subtotal, order.currencyCode)} />
                <StatRow label="Shipping" value={formatMoneyString(order.shippingTotal, order.currencyCode)} />
                <StatRow label="Tax" value={formatMoneyString(order.taxTotal, order.currencyCode)} />
                <StatRow
                  label="Discount"
                  value={`−${formatMoneyString(order.discountTotal, order.currencyCode)}`}
                />
                <StatRow
                  label="Grand total"
                  value={
                    <span className="text-base font-semibold">
                      {formatMoneyString(order.grandTotal, order.currencyCode)}
                    </span>
                  }
                />
                {order.refundedTotal !== '0.00' ? (
                  <StatRow
                    label="Refunded"
                    value={
                      <span className="text-warning">
                        {formatMoneyString(order.refundedTotal, order.currencyCode)}
                      </span>
                    }
                  />
                ) : null}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Customer</CardTitle>
              <CardDescription>Personal data is masked and never persisted in full.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <StatRow label="Name" value={order.customerName ?? 'Guest checkout'} />
                <StatRow label="Email" value={order.customerEmailMasked ?? '—'} />
                <StatRow label="Country" value={order.countryCode ?? '—'} />
                <StatRow
                  label="Customer record"
                  value={
                    order.customerExternalId ? (
                      <Link
                        href={`/customers?store=${order.connectionId}&external=${order.customerExternalId}`}
                        className="text-primary hover:underline"
                      >
                        View in this store
                      </Link>
                    ) : (
                      'Guest'
                    )
                  }
                />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <CreditCard className="h-4 w-4" aria-hidden />
                Payment and fulfilment
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <StatRow label="Payment method" value={order.paymentMethod ?? '—'} />
                <StatRow label="Payment status" value={titleCase(order.paymentStatus)} />
                <StatRow label="Fulfilment" value={titleCase(order.fulfilmentStatus)} />
                <StatRow label="Order source" value={order.orderSource ?? '—'} />
              </dl>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                No card data is read, stored or displayed by this platform. Only the gateway&rsquo;s reported
                status and the amount are surfaced.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Section title="Actions" className="mt-6">
        <div className="grid gap-4 md:grid-cols-2">
          <UnavailableState
            title="Update order status"
            icon={Truck}
            reason={
              <>
                <CapabilityBadge status={statusCapability?.status ?? 'NOT_IMPLEMENTED'} showIcon={false} />{' '}
                {statusCapability?.unavailableReason ??
                  CAPABILITY_DEFINITIONS['orders.update_status'].unavailableReason}
              </>
            }
            docsHref="https://docs.bigcommerce.com/api-reference/store-management/orders"
          />
          <UnavailableState
            title="Create a refund"
            icon={Ban}
            reason={
              <>
                <CapabilityBadge status={refundCapability?.status ?? 'MANUAL_ACTION'} showIcon={false} />{' '}
                {refundCapability?.unavailableReason ??
                  CAPABILITY_DEFINITIONS['orders.create_refund'].unavailableReason}
              </>
            }
            docsHref="https://docs.bigcommerce.com/api-reference/store-management/orders"
          />
        </div>
      </Section>
    </>
  );
}
