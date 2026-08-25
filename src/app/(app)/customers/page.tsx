import Link from 'next/link';
import type { Metadata } from 'next';
import { ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MetricCard } from '@/components/shared/metric-card';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, InfoNote } from '@/components/shared/states';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth, tenantWhere } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { formatMoneyString } from '@/lib/money';
import { countryFlag, formatNumber, formatRelativeTime, titleCase } from '@/lib/utils';

export const metadata: Metadata = { title: 'Customers' };
export const dynamic = 'force-dynamic';

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string; external?: string }>;
}) {
  const auth = await requireAuthOrRedirect('/customers');
  const scope = scopeFromAuth(auth);
  const params = await searchParams;

  const stores = await prisma.storeConnection.findMany({
    where: { ...tenantWhere(scope), deletedAt: null, ...(params.store ? { id: params.store } : {}) },
    select: { id: true, name: true },
  });
  const storeIds = stores.map((store) => store.id);

  const [customers, totalCount, duplicateEmails] = await Promise.all([
    prisma.customerSnapshot.findMany({
      where: {
        organisationId: scope.organisationId,
        connectionId: { in: storeIds },
        ...(params.external ? { externalCustomerId: Number(params.external) } : {}),
      },
      orderBy: [{ lastOrderAt: 'desc' }],
      take: 200,
      include: { connection: { select: { id: true, name: true, countryCode: true } } },
    }),
    prisma.customerSnapshot.count({
      where: { organisationId: scope.organisationId, connectionId: { in: storeIds } },
    }),
    // Same email hash appearing in more than one store — reported, never merged.
    prisma.customerSnapshot.groupBy({
      by: ['emailHash'],
      where: { organisationId: scope.organisationId, connectionId: { in: storeIds } },
      _count: { _all: true },
      having: { emailHash: { _count: { gt: 1 } } },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Customers"
        breadcrumbs={[{ label: 'Commerce' }, { label: 'Customers' }]}
        description="Customer records stay scoped to the store they belong to. This is a unified reporting view, not a merged identity."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Customer records" value={formatNumber(totalCount)} hint={`across ${formatNumber(stores.length)} stores`} />
        <MetricCard label="Shown" value={formatNumber(customers.length)} hint="most recently active" />
        <MetricCard
          label="Emails seen in several stores"
          value={formatNumber(duplicateEmails.length)}
          tooltip="The same email hash appears in more than one store. These are reported so a human can decide — identities are never merged automatically."
        />
        <MetricCard label="Stores in scope" value={formatNumber(stores.length)} />
      </div>

      <InfoNote className="mb-6">
        <span className="font-medium">Personal data is deliberately minimised.</span> Only a masked email and a
        salted hash are stored; the hash exists purely so the same person appearing in two stores can be{' '}
        <em>reported</em>. Full personal data is fetched on demand from BigCommerce and never persisted here.
      </InfoNote>

      {customers.length === 0 ? (
        <EmptyState
          title="No customers captured yet"
          description="Customer snapshots are pulled from BigCommerce by a sync job, masked at the boundary."
          action={{
            label: 'Pull customers',
            href: params.store
              ? `/sync?action=customers&targets=${params.store}`
              : '/sync?action=customers',
          }}
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Store of origin</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Lifetime value</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last order</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell>
                    <Link href={`/customers/${customer.id}`} className="font-medium hover:underline">
                      {[customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'Unnamed'}
                    </Link>
                    <p className="text-xs text-muted-foreground">{customer.emailMasked}</p>
                    {customer.company ? (
                      <p className="text-xs text-muted-foreground">{customer.company}</p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Link href={`/stores/${customer.connectionId}`} className="text-sm hover:underline">
                      <span aria-hidden className="mr-1">
                        {countryFlag(customer.connection.countryCode)}
                      </span>
                      {customer.connection.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {customer.customerGroupName ? (
                      <Badge variant="secondary" size="sm">
                        {customer.customerGroupName}
                      </Badge>
                    ) : (
                      '—'
                    )}
                    {customer.customerGroupExternalId ? (
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                        id {customer.customerGroupExternalId}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant={customer.status === 'ACTIVE' ? 'success' : 'muted'} size="sm">
                      {titleCase(customer.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular text-right">{customer.orderCount}</TableCell>
                  <TableCell className="tabular text-right font-medium">
                    {formatMoneyString(customer.lifetimeValue, customer.currencyCode)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatRelativeTime(customer.externalCreatedAt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatRelativeTime(customer.lastOrderAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <div className="mt-6 flex gap-2.5 rounded-md border border-info/25 bg-info/[0.04] px-3.5 py-3 text-sm">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden />
        <div className="leading-relaxed">
          <p className="font-medium">Why identities are not merged</p>
          <p className="mt-0.5 text-muted-foreground">
            Two accounts sharing an email address in different stores may be the same person or may not, and the
            stores may sit under different legal entities with different consent. Merging them automatically
            would be a data-protection decision this platform is not entitled to make on your behalf.
          </p>
        </div>
      </div>
    </>
  );
}
