import Link from 'next/link';
import type { Metadata } from 'next';
import { Rocket } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MetricCard } from '@/components/shared/metric-card';
import { PageHeader, Section } from '@/components/shared/page-header';
import { EmptyState, InfoNote, WarningNote } from '@/components/shared/states';
import { HealthDot } from '@/components/shared/status-badges';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth, tenantWhere } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { PRICE_ORIGIN_LABELS, type PriceOrigin } from '@/lib/enums';
import { formatMoneyString } from '@/lib/money';
import { countryFlag, formatNumber } from '@/lib/utils';

export const metadata: Metadata = { title: 'Pricing' };
export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  const auth = await requireAuthOrRedirect('/pricing');
  const scope = scopeFromAuth(auth);

  const stores = await prisma.storeConnection.findMany({
    where: { ...tenantWhere(scope), deletedAt: null },
    orderBy: [{ hierarchyMode: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      countryCode: true,
      currencyCode: true,
      healthStatus: true,
      hierarchyMode: true,
    },
  });

  const storeIds = stores.map((store) => store.id);

  const [entries, priceLists, overrideCount] = await Promise.all([
    prisma.pricingEntry.findMany({
      where: { organisationId: scope.organisationId, connectionId: { in: storeIds } },
      orderBy: { sku: 'asc' },
      take: 3000,
      select: {
        connectionId: true,
        sku: true,
        currencyCode: true,
        basePrice: true,
        salePrice: true,
        origin: true,
        isOverride: true,
      },
    }),
    prisma.priceListSnapshot.findMany({
      where: { organisationId: scope.organisationId, connectionId: { in: storeIds } },
      include: { connection: { select: { name: true, currencyCode: true } } },
      orderBy: [{ connection: { name: 'asc' } }, { name: 'asc' }],
    }),
    prisma.pricingEntry.count({
      where: {
        organisationId: scope.organisationId,
        connectionId: { in: storeIds },
        isOverride: true,
      },
    }),
  ]);

  // Build the SKU × store price matrix.
  const bySku = new Map<string, Map<string, (typeof entries)[number]>>();
  for (const entry of entries) {
    const row = bySku.get(entry.sku) ?? new Map();
    row.set(entry.connectionId, entry);
    bySku.set(entry.sku, row);
  }

  const rows = [...bySku.entries()]
    .map(([sku, cells]) => ({ sku, cells }))
    .sort((a, b) => a.sku.localeCompare(b.sku))
    .slice(0, 120);

  const currencies = [...new Set(stores.map((store) => store.currencyCode))].sort();
  const currencyCount = currencies.length;

  return (
    <>
      <PageHeader
        title="Pricing"
        breadcrumbs={[{ label: 'Commerce' }, { label: 'Pricing' }]}
        description="Base prices, price lists and local overrides across every store in scope. Prices are shown in each store's own currency and are never converted."
        actions={
          <Button size="sm" asChild>
            <Link href="/deployments/new?category=PRICING">
              <Rocket className="h-4 w-4" aria-hidden />
              Plan a pricing deployment
            </Link>
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Priced SKUs" value={formatNumber(bySku.size)} />
        <MetricCard
          label="Currencies in play"
          value={formatNumber(currencyCount)}
          hint={currencies.join(', ')}
          tooltip="Prices in different currencies are never compared or added. A difference across currencies is expected, not drift."
        />
        <MetricCard
          label="Local price overrides"
          value={formatNumber(overrideCount)}
          tooltip="Deliberate local prices recorded against a store, kept separate from the inherited value."
        />
        <MetricCard
          label="Price lists"
          value={formatNumber(priceLists.length)}
          tooltip="Price lists are how BigCommerce expresses per-currency, per-channel and per-customer-group pricing."
        />
      </div>

      {currencyCount > 1 ? (
        <WarningNote className="mb-6">
          <span className="font-medium">Stores in scope trade in {currencyCount} currencies.</span> A pricing
          deployment copies the source amount as-is — it does not convert. Deploying a GBP price into a USD
          store would set that literal number in dollars.
        </WarningNote>
      ) : null}

      <InfoNote className="mb-6">
        The BigCommerce product record holds one base price in the store&rsquo;s transactional currency.
        Per-channel, per-currency and per-customer-group pricing lives in <em>price lists</em>, not on the
        product. That distinction is preserved here.
      </InfoNote>

      <Section title="Price matrix" description="Products on rows, stores in columns.">
        {rows.length === 0 ? (
          <EmptyState
            title="No pricing captured"
            description="Run a catalog pull to capture pricing from the stores in scope."
            action={{ label: 'Pull the catalog', href: '/sync?action=catalog' }}
          />
        ) : (
          <Card>
            <div className="overflow-x-auto thin-scrollbar">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 z-10 min-w-[10rem] bg-background">SKU</TableHead>
                    {stores.map((store) => (
                      <TableHead key={store.id} className="min-w-[8rem]">
                        <Link href={`/stores/${store.id}`} className="flex items-center gap-1 hover:underline">
                          <HealthDot status={store.healthStatus} />
                          <span aria-hidden>{countryFlag(store.countryCode)}</span>
                          <span className="truncate">{store.name}</span>
                        </Link>
                        <span className="text-[10px] font-normal normal-case text-muted-foreground">
                          {store.currencyCode}
                        </span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.sku}>
                      <TableCell className="sticky left-0 z-10 bg-background">
                        <Link
                          href={`/catalog/${encodeURIComponent(row.sku)}`}
                          className="font-mono text-xs font-medium hover:underline"
                        >
                          {row.sku}
                        </Link>
                      </TableCell>
                      {stores.map((store) => {
                        const cell = row.cells.get(store.id);
                        if (!cell) {
                          return (
                            <TableCell key={store.id}>
                              <span className="text-xs text-muted-foreground">—</span>
                            </TableCell>
                          );
                        }
                        return (
                          <TableCell key={store.id}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="space-y-0.5">
                                  <p
                                    className={
                                      cell.isOverride
                                        ? 'tabular text-sm font-medium text-warning'
                                        : 'tabular text-sm font-medium'
                                    }
                                  >
                                    {formatMoneyString(cell.basePrice, cell.currencyCode)}
                                  </p>
                                  {cell.salePrice ? (
                                    <p className="tabular text-xs text-success">
                                      {formatMoneyString(cell.salePrice, cell.currencyCode)}
                                    </p>
                                  ) : null}
                                  {cell.isOverride ? (
                                    <Badge variant="warning" size="sm">
                                      Override
                                    </Badge>
                                  ) : null}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                {PRICE_ORIGIN_LABELS[cell.origin as PriceOrigin] ?? cell.origin} ·{' '}
                                {cell.currencyCode}
                              </TooltipContent>
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
        {bySku.size > rows.length ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Showing the first {formatNumber(rows.length)} of {formatNumber(bySku.size)} SKUs. Narrow the scope
            with the store selector to see the rest.
          </p>
        ) : null}
      </Section>

      <Section
        title="Price lists"
        description="Where per-group and per-channel pricing actually lives on BigCommerce."
      >
        {priceLists.length === 0 ? (
          <EmptyState
            title="No price lists"
            description="No store in scope has a captured price list. B2B stores typically use them for account-based pricing."
          />
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Price list</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Records</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Local id</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {priceLists.map((list) => (
                  <TableRow key={list.id}>
                    <TableCell className="font-medium">{list.name}</TableCell>
                    <TableCell className="text-muted-foreground">{list.connection.name}</TableCell>
                    <TableCell>{list.currencyCode ?? list.connection.currencyCode}</TableCell>
                    <TableCell className="tabular text-right">{formatNumber(list.recordCount)}</TableCell>
                    <TableCell>
                      <Badge variant={list.isActive ? 'success' : 'muted'} size="sm">
                        {list.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <code className="font-mono text-xs text-muted-foreground">
                        {list.externalPriceListId}
                      </code>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </Section>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">How a displayed price is arrived at</CardTitle>
          <CardDescription>
            The origin of every price is tracked so an operator can tell a copied price from an inherited one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {(Object.keys(PRICE_ORIGIN_LABELS) as PriceOrigin[]).map((origin) => (
              <div key={origin} className="flex gap-3 border-b py-2">
                <dt className="w-40 shrink-0">
                  <Badge variant="secondary" size="sm">
                    {PRICE_ORIGIN_LABELS[origin]}
                  </Badge>
                </dt>
                <dd className="text-xs leading-relaxed text-muted-foreground">
                  {ORIGIN_EXPLANATIONS[origin]}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </>
  );
}

const ORIGIN_EXPLANATIONS: Record<PriceOrigin, string> = {
  BASE: 'Read from the product record in the store, in its transactional currency.',
  PRICE_LIST:
    'Comes from a price list assigned to a customer group or channel, which overrides the base price at checkout.',
  LOCAL_OVERRIDE:
    'A deliberate local decision recorded in this platform. It survives future source changes unless the inheritance mode says otherwise.',
  INHERITED_COPY: 'Copied once from a source store, after which the two prices are free to diverge.',
  CALCULATED_DISPLAY:
    'A derived figure shown for comparison only, such as a converted amount. It is never written to a store.',
};
