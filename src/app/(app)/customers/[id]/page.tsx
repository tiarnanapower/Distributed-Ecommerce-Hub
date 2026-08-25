import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatRow } from '@/components/shared/metric-card';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, InfoNote } from '@/components/shared/states';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { assertTenantAccess, scopeFromAuth } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { formatMoneyString } from '@/lib/money';
import { countryFlag, formatDateTime, formatRelativeTime, titleCase } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const customer = await prisma.customerSnapshot.findUnique({
    where: { id },
    select: { firstName: true, lastName: true },
  });
  return {
    title: customer ? `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() || 'Customer' : 'Customer',
  };
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuthOrRedirect(`/customers/${id}`);
  const scope = scopeFromAuth(auth);

  const customer = await prisma.customerSnapshot.findUnique({
    where: { id },
    include: {
      connection: { select: { id: true, name: true, countryCode: true, currencyCode: true, isDemo: true } },
    },
  });

  if (!customer) notFound();
  assertTenantAccess(customer, scope, 'customer');

  const [orders, sameEmailElsewhere] = await Promise.all([
    prisma.orderSnapshot.findMany({
      where: { connectionId: customer.connectionId, customerExternalId: customer.externalCustomerId },
      orderBy: { placedAt: 'desc' },
      take: 25,
    }),
    prisma.customerSnapshot.findMany({
      where: {
        organisationId: scope.organisationId,
        emailHash: customer.emailHash,
        id: { not: customer.id },
      },
      include: { connection: { select: { id: true, name: true } } },
    }),
  ]);

  const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'Unnamed customer';

  return (
    <>
      <PageHeader
        title={name}
        breadcrumbs={[
          { label: 'Commerce' },
          { label: 'Customers', href: '/customers' },
          { label: name },
        ]}
        description={
          <span className="flex flex-wrap items-center gap-x-2">
            {customer.emailMasked} · customer of
            <Link href={`/stores/${customer.connectionId}`} className="hover:underline">
              <span aria-hidden className="mr-1">
                {countryFlag(customer.connection.countryCode)}
              </span>
              {customer.connection.name}
            </Link>
          </span>
        }
        meta={<Badge variant={customer.status === 'ACTIVE' ? 'success' : 'muted'}>{titleCase(customer.status)}</Badge>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Orders in this store</CardTitle>
            <CardDescription>
              Only orders from {customer.connection.name}. Orders placed in other stores belong to a different
              customer record.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {orders.length === 0 ? (
              <EmptyState title="No orders" description="This customer has not placed an order in this store." className="border-0" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Placed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <Link href={`/orders/${order.id}`} className="font-medium hover:underline">
                          {order.orderNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" size="sm">
                          {order.statusLabel}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular text-right">{order.itemCount}</TableCell>
                      <TableCell className="tabular text-right font-medium">
                        {formatMoneyString(order.grandTotal, order.currencyCode)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(order.placedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Account</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <StatRow label="Store-local id" value={<code className="font-mono text-xs">{customer.externalCustomerId}</code>} />
                <StatRow label="Email" value={customer.emailMasked} />
                <StatRow label="Phone" value={customer.phoneMasked ?? '—'} />
                <StatRow label="Company" value={customer.company ?? '—'} />
                <StatRow label="Group" value={customer.customerGroupName ?? '—'} />
                <StatRow label="Country" value={customer.countryCode ?? '—'} />
                <StatRow label="Accepts marketing" value={customer.acceptsMarketing ? 'Yes' : 'No'} />
                <StatRow label="Store credit" value={formatMoneyString(customer.storeCredit, customer.currencyCode)} />
                <StatRow label="Created" value={formatRelativeTime(customer.externalCreatedAt)} />
                <StatRow label="Last order" value={formatRelativeTime(customer.lastOrderAt)} />
                <StatRow
                  label="Lifetime value"
                  value={formatMoneyString(customer.lifetimeValue, customer.currencyCode)}
                />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <ShieldCheck className="h-4 w-4 text-info" aria-hidden />
                Same email in other stores
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sameEmailElsewhere.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This email hash does not appear in any other store in the organisation.
                </p>
              ) : (
                <>
                  <ul className="space-y-1.5">
                    {sameEmailElsewhere.map((other) => (
                      <li key={other.id}>
                        <Link
                          href={`/customers/${other.id}`}
                          className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:border-primary/40"
                        >
                          <span className="truncate">{other.connection.name}</span>
                          <span className="tabular shrink-0 text-xs text-muted-foreground">
                            {other.orderCount} order{other.orderCount === 1 ? '' : 's'}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    These are separate customer accounts in separate BigCommerce stores. They are shown together
                    for reporting only — no identity has been merged, and none will be without an explicit,
                    lawful decision.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <InfoNote className="mt-6">
        Addresses, full email and phone number are not stored by this platform. To see them, open the customer in
        the BigCommerce control panel for {customer.connection.name}.
      </InfoNote>
    </>
  );
}
