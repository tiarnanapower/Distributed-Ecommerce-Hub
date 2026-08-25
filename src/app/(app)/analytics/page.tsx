import Link from 'next/link';
import type { Metadata } from 'next';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ComparisonBarChart,
  DonutChart,
  HorizontalBarChart,
  RevenueTrendChart,
} from '@/components/charts/charts';
import { DateRangePicker } from '@/components/shared/date-range-picker';
import { MetricCard, StatRow } from '@/components/shared/metric-card';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, InfoNote, WarningNote } from '@/components/shared/states';
import { DataSourceBadge, HealthDot } from '@/components/shared/status-badges';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth } from '@/lib/tenancy';
import { loadOverview } from '@/server/services/overview';
import { resolveDateRange, type DateRangePreset } from '@/lib/date-range';
import { formatMoney, toDecimalString } from '@/lib/money';
import { countryFlag, countryName, formatNumber, formatPercent } from '@/lib/utils';

export const metadata: Metadata = { title: 'Analytics' };
export const dynamic = 'force-dynamic';

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const auth = await requireAuthOrRedirect('/analytics');
  const scope = scopeFromAuth(auth);
  const params = await searchParams;

  const preset = (params.range ?? 'last30') as DateRangePreset;
  const range = resolveDateRange(preset, {
    from: params.from ? new Date(params.from) : undefined,
    to: params.to ? new Date(`${params.to}T23:59:59`) : undefined,
  });

  const data = await loadOverview(scope, range);
  const currency = data.reportingCurrency;

  const storeComparison = [...data.storePerformance]
    .sort((a, b) => Number(b.revenue.minor - a.revenue.minor))
    .map((store) => ({
      label: store.name.length > 18 ? `${store.name.slice(0, 17)}…` : store.name,
      Orders: store.orderCount,
      'Refund rate %': store.refundRate ?? 0,
    }));

  const localisation = data.storePerformance.map((store) => ({
    name: store.name,
    countryCode: store.countryCode,
    currencyCode: store.currencyCode,
    orders: store.orderCount,
    revenue: store.revenue,
    healthStatus: store.healthStatus,
  }));

  const currencyTotals = [...data.revenueTotal.byCurrency.entries()].map(([code, amount]) => ({
    label: code,
    amount: Number(toDecimalString(amount)),
  }));

  return (
    <>
      <PageHeader
        title="Analytics"
        breadcrumbs={[{ label: 'Overview' }, { label: 'Analytics' }]}
        description={`${range.label} · ${range.from.toISOString().slice(0, 10)} to ${range.to.toISOString().slice(0, 10)}`}
        meta={
          <DataSourceBadge
            source={data.containsLiveData && data.containsDemoData ? 'MIXED' : data.containsLiveData ? 'LIVE' : 'DEMO'}
          />
        }
        actions={<DateRangePicker preset={preset} from={params.from} to={params.to} />}
      />

      {data.reportingRevenue.requiresDisclaimer ? (
        <WarningNote className="mb-6">{data.reportingRevenue.formattedNote}</WarningNote>
      ) : null}

      <Tabs defaultValue="executive">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="executive">Executive</TabsTrigger>
          <TabsTrigger value="stores">Store comparison</TabsTrigger>
          <TabsTrigger value="catalog">Catalog</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="globalisation">Globalisation</TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------------------- */}
        <TabsContent value="executive" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label={`Revenue (${currency})`}
              value={formatMoney(data.reportingRevenue.total, { compact: true })}
              deltaPercent={data.revenueDeltaPercent}
            />
            <MetricCard
              label="Orders"
              value={formatNumber(data.metrics.orderCount)}
              deltaPercent={data.orderDeltaPercent}
            />
            <MetricCard label="Units sold" value={formatNumber(data.metrics.unitsSold)} />
            <MetricCard
              label="Refund value"
              value={formatMoney(data.reportingRefunds.total, { compact: true })}
              higherIsBetter={false}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="New customers" value={formatNumber(data.metrics.newCustomers)} />
            <MetricCard
              label="Returning customers"
              value={formatNumber(data.metrics.returningCustomers)}
              tooltip="Derived from daily snapshots. Identities are never merged across stores, so a shopper active in two stores counts in both."
            />
            <MetricCard
              label="Refund rate"
              value={
                data.metrics.refundRatePercent !== null
                  ? formatPercent(data.metrics.refundRatePercent)
                  : '—'
              }
              higherIsBetter={false}
              unavailableReason={
                data.metrics.refundRatePercent === null
                  ? 'Refunded value as a share of revenue is only meaningful within one currency. The scope spans several.'
                  : undefined
              }
            />
            <MetricCard
              label="Conversion rate"
              value={
                data.metrics.conversionRate !== null ? formatPercent(data.metrics.conversionRate, 2) : '—'
              }
              unavailableReason={
                data.metrics.conversionRate === null
                  ? 'No storefront session data is available through the management API.'
                  : undefined
              }
            />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Revenue trend</CardTitle>
              <CardDescription>{data.trend.note ?? `Daily revenue in ${currency}.`}</CardDescription>
            </CardHeader>
            <CardContent>
              {data.trend.points.length === 0 ? (
                <EmptyState title="No data" description="No revenue was recorded in this period." />
              ) : (
                <RevenueTrendChart data={data.trend.points} currencyCode={currency} height={300} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------- */}
        <TabsContent value="stores" className="space-y-4">
          <InfoNote>
            Every figure below is in the store&rsquo;s own currency. Nothing is converted, so the numbers are
            directly comparable to what the merchant sees in their own control panel.
          </InfoNote>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Orders and refund rate by store</CardTitle>
              <CardDescription>Counts and percentages, which are currency-independent.</CardDescription>
            </CardHeader>
            <CardContent>
              {storeComparison.length === 0 ? (
                <EmptyState title="No data" description="No stores in scope have trading data." />
              ) : (
                <ComparisonBarChart
                  data={storeComparison}
                  bars={[
                    { dataKey: 'Orders', name: 'Orders', colorIndex: 0 },
                    { dataKey: 'Refund rate %', name: 'Refund rate %', colorIndex: 4 },
                  ]}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Store</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">AOV</TableHead>
                  <TableHead className="text-right">Refunds</TableHead>
                  <TableHead className="text-right">Growth</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...data.storePerformance]
                  .sort((a, b) => Number(b.revenue.minor - a.revenue.minor))
                  .map((store) => (
                    <TableRow key={store.connectionId}>
                      <TableCell>
                        <Link
                          href={`/stores/${store.connectionId}`}
                          className="flex items-center gap-1.5 font-medium hover:underline"
                        >
                          <HealthDot status={store.healthStatus} />
                          <span aria-hidden>{countryFlag(store.countryCode)}</span>
                          {store.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{store.companyName}</TableCell>
                      <TableCell>{store.currencyCode}</TableCell>
                      <TableCell className="tabular text-right font-medium">
                        {formatMoney(store.revenue, { compact: true })}
                      </TableCell>
                      <TableCell className="tabular text-right">{formatNumber(store.orderCount)}</TableCell>
                      <TableCell className="tabular text-right">
                        {formatMoney(store.averageOrderValue)}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {formatMoney(store.refundValue, { compact: true })}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {store.growthPercent !== null ? (
                          <span className={store.growthPercent >= 0 ? 'text-success' : 'text-destructive'}>
                            {store.growthPercent >= 0 ? '+' : ''}
                            {formatPercent(store.growthPercent)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------- */}
        <TabsContent value="catalog" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Catalog consistency"
              value={
                data.catalogConsistency.score !== null ? `${data.catalogConsistency.score.toFixed(1)}%` : '—'
              }
              unavailableReason={data.catalogConsistency.reason}
              tone={
                data.catalogConsistency.score !== null && data.catalogConsistency.score < 80
                  ? 'warning'
                  : 'default'
              }
            />
            <MetricCard
              label="Products missing somewhere"
              value={formatNumber(data.catalogConsistency.missing)}
              tone={data.catalogConsistency.missing > 0 ? 'warning' : 'default'}
            />
            <MetricCard
              label="Products with inconsistent data"
              value={formatNumber(data.catalogConsistency.diverging)}
            />
            <MetricCard label="Comparisons made" value={formatNumber(data.catalogConsistency.totalComparisons)} />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Top products</CardTitle>
              <CardDescription>
                Measured from order lines and converted into {currency} where necessary.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {data.topProducts.length === 0 ? (
                <EmptyState title="No product sales" description="No order lines fall inside this period." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Stores</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.topProducts.map((item) => (
                      <TableRow key={item.sku}>
                        <TableCell>
                          <Link href={`/catalog/${encodeURIComponent(item.sku)}`} className="hover:underline">
                            <p className="font-medium">{item.name}</p>
                            <p className="font-mono text-xs text-muted-foreground">{item.sku}</p>
                          </Link>
                        </TableCell>
                        <TableCell className="tabular text-right">{item.storeCount}</TableCell>
                        <TableCell className="tabular text-right">{formatNumber(item.unitsSold)}</TableCell>
                        <TableCell className="tabular text-right font-medium">
                          {new Intl.NumberFormat('en-GB', {
                            style: 'currency',
                            currency,
                            notation: 'compact',
                            maximumFractionDigits: 1,
                          }).format(item.revenue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Inventory risk</CardTitle>
              <CardDescription>Products at or below their low-stock threshold.</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {data.lowStock.length === 0 ? (
                <EmptyState title="No inventory risk" description="Every tracked product is above its threshold." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Store</TableHead>
                      <TableHead className="text-right">On hand</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.lowStock.map((item, index) => (
                      <TableRow key={`${item.storeId}-${item.sku}-${index}`}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-muted-foreground">{item.storeName}</TableCell>
                        <TableCell className="tabular text-right">{item.quantity}</TableCell>
                        <TableCell>
                          <Badge variant={item.status === 'OUT_OF_STOCK' ? 'destructive' : 'warning'} size="sm">
                            {item.status === 'OUT_OF_STOCK' ? 'Out of stock' : 'Low'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------- */}
        <TabsContent value="operations" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Sync success rate"
              value={data.syncSuccessRate !== null ? formatPercent(data.syncSuccessRate) : '—'}
              unavailableReason={
                data.syncSuccessRate === null ? 'No job reached a terminal state in this period.' : undefined
              }
            />
            <MetricCard
              label="Failed deployments"
              value={formatNumber(data.failedDeployments)}
              tone={data.failedDeployments > 0 ? 'warning' : 'default'}
            />
            <MetricCard
              label="Stale stores"
              value={formatNumber(data.health.staleStores)}
              tooltip="Active stores with no successful sync in the last 48 hours."
            />
            <MetricCard
              label="Authentication failures"
              value={formatNumber(data.health.credentialIssues)}
              tone={data.health.credentialIssues > 0 ? 'destructive' : 'default'}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Open conflicts" value={formatNumber(data.openConflicts)} />
            <MetricCard
              label="Stores diverging"
              value={formatNumber(data.storesDivergingFromMaster)}
              tooltip="Stores with at least one unresolved difference from their source."
            />
            <MetricCard label="Pending approvals" value={formatNumber(data.pendingApprovals)} />
            <MetricCard
              label="Store availability"
              value={
                data.health.total > 0
                  ? formatPercent((data.health.healthy / data.health.total) * 100)
                  : '—'
              }
            />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Estate health breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <StatRow label="Healthy" value={formatNumber(data.health.healthy)} />
                <StatRow label="Warning" value={formatNumber(data.health.warning)} />
                <StatRow label="Critical" value={formatNumber(data.health.critical)} />
                <StatRow label="Unknown" value={formatNumber(data.health.unknown)} />
                <StatRow label="Planned (not yet connected)" value={formatNumber(data.health.planned)} />
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------- */}
        <TabsContent value="globalisation" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Revenue by country</CardTitle>
                <CardDescription>Converted to {currency}.</CardDescription>
              </CardHeader>
              <CardContent>
                {data.revenueByCountry.length === 0 ? (
                  <EmptyState title="No data" description="No revenue in this period." />
                ) : (
                  <HorizontalBarChart
                    data={data.revenueByCountry.map((slice) => ({
                      label: countryName(slice.key),
                      amount: slice.amount,
                    }))}
                    currencyCode={currency}
                    height={300}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Revenue by currency</CardTitle>
                <CardDescription>
                  Original transaction currency, before any conversion. This is the honest view.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {currencyTotals.length === 0 ? (
                  <EmptyState title="No data" description="No revenue in this period." />
                ) : (
                  <DonutChart data={currencyTotals} currencyCode={currency} height={300} />
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Localisation coverage by store</CardTitle>
              <CardDescription>Country, currency and trading volume per storefront.</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Store</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Revenue (local)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {localisation.map((store) => (
                    <TableRow key={store.name}>
                      <TableCell>
                        <span className="flex items-center gap-1.5">
                          <HealthDot status={store.healthStatus} />
                          {store.name}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span aria-hidden className="mr-1">
                          {countryFlag(store.countryCode)}
                        </span>
                        {countryName(store.countryCode)}
                      </TableCell>
                      <TableCell>{store.currencyCode}</TableCell>
                      <TableCell className="tabular text-right">{formatNumber(store.orders)}</TableCell>
                      <TableCell className="tabular text-right font-medium">
                        {formatMoney(store.revenue, { compact: true })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <InfoNote>
            Multi-currency totals are held per currency and only combined when an explicit exchange rate exists.
            The rates in this build are fixed demo values, clearly labelled — configure a real rate source before
            any of these converted figures are used for reporting.
          </InfoNote>
        </TabsContent>
      </Tabs>
    </>
  );
}
