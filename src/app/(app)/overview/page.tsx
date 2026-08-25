import Link from 'next/link';
import type { Metadata } from 'next';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ClipboardCheck,
  GitCompareArrows,
  KeyRound,
  Package,
  Rocket,
  Store as StoreIcon,
  TrendingDown,
  Warehouse,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DonutChart, HorizontalBarChart, OrdersTrendChart, RevenueTrendChart } from '@/components/charts/charts';
import { DateRangePicker } from '@/components/shared/date-range-picker';
import { MetricCard, StatRow } from '@/components/shared/metric-card';
import { PageHeader, Section } from '@/components/shared/page-header';
import { EmptyState, InfoNote, WarningNote } from '@/components/shared/states';
import { DataSourceBadge, HealthDot } from '@/components/shared/status-badges';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth } from '@/lib/tenancy';
import { loadShellData } from '@/server/services/scope';
import { loadOverview } from '@/server/services/overview';
import { resolveDateRange, type DateRangePreset } from '@/server/services/analytics';
import { formatMoney } from '@/lib/money';
import {
  countryFlag,
  countryName,
  formatCompactNumber,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  titleCase,
} from '@/lib/utils';

export const metadata: Metadata = { title: 'Overview' };
export const dynamic = 'force-dynamic';

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const auth = await requireAuthOrRedirect('/overview');
  const scope = scopeFromAuth(auth);
  const shell = await loadShellData(scope);
  const params = await searchParams;

  const preset = (params.range ?? 'last30') as DateRangePreset;
  const range = resolveDateRange(preset, {
    from: params.from ? new Date(params.from) : undefined,
    to: params.to ? new Date(`${params.to}T23:59:59`) : undefined,
  });

  const data = await loadOverview(scope, range);
  const currency = data.reportingCurrency;

  const scopeLabel = [shell.active.companyName ?? 'All companies', shell.active.storeName]
    .filter(Boolean)
    .join(' · ');

  const attentionCount = data.health.warning + data.health.critical;
  const availability =
    data.health.total > 0 ? (data.health.healthy / data.health.total) * 100 : null;

  return (
    <>
      <PageHeader
        title="Executive overview"
        description={
          <>
            {scopeLabel} · {range.label} ({range.from.toISOString().slice(0, 10)} to{' '}
            {range.to.toISOString().slice(0, 10)})
          </>
        }
        meta={
          <DataSourceBadge
            source={data.containsLiveData && data.containsDemoData ? 'MIXED' : data.containsLiveData ? 'LIVE' : 'DEMO'}
            reason={shell.mode.detail}
          />
        }
        actions={<DateRangePicker preset={preset} from={params.from} to={params.to} />}
      />

      {data.reportingRevenue.requiresDisclaimer ? (
        <WarningNote className="mb-6">
          <span className="font-medium">Reporting-currency totals are converted.</span>{' '}
          {data.reportingRevenue.formattedNote} Per-store figures below stay in each store&rsquo;s own currency
          and are never converted.
        </WarningNote>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      <Section title="Commercial performance" id="commercial">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label={`Revenue (${currency})`}
            value={formatMoney(data.reportingRevenue.total, { compact: true })}
            deltaPercent={data.revenueDeltaPercent}
            hint="vs previous period"
            tooltip={
              data.revenueTotal.isMixed
                ? `Summed per currency (${data.revenueTotal.currencies.join(', ')}) and converted to ${currency}. Amounts in different currencies are never added directly.`
                : `Measured from order snapshots in ${currency}.`
            }
            href="/analytics"
          />
          <MetricCard
            label="Orders"
            value={formatNumber(data.metrics.orderCount)}
            deltaPercent={data.orderDeltaPercent}
            hint="vs previous period"
            tooltip="Order count across every store in scope for the selected period."
            href="/orders"
          />
          <MetricCard
            label="Average order value"
            value={
              data.aovByCurrency.length === 1
                ? formatMoney(data.aovByCurrency[0]!.amount)
                : data.metrics.orderCount > 0
                  ? formatMoney(
                      {
                        ...data.reportingRevenue.total,
                        minor: data.reportingRevenue.total.minor / BigInt(data.metrics.orderCount),
                      },
                      { compact: true },
                    )
                  : '—'
            }
            hint={
              data.aovByCurrency.length > 1
                ? `Blended across ${data.aovByCurrency.length} currencies`
                : undefined
            }
            tooltip="Computed per currency and only blended once converted into the reporting currency."
          />
          <MetricCard
            label="Refund rate"
            value={
              data.metrics.refundRatePercent !== null
                ? formatPercent(data.metrics.refundRatePercent)
                : formatPercent(
                    data.metrics.orderCount > 0
                      ? (data.metrics.refundCount / data.metrics.orderCount) * 100
                      : null,
                  )
            }
            higherIsBetter={false}
            hint={`${formatNumber(data.metrics.refundCount)} refunded orders`}
            tooltip={
              data.metrics.refundRatePercent === null
                ? 'Refunded value as a share of revenue is only meaningful within one currency, so this shows the refunded-order share instead.'
                : 'Refunded value as a share of revenue.'
            }
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Customers"
            value={formatNumber(data.metrics.newCustomers + data.metrics.returningCustomers)}
            hint={`${formatNumber(data.metrics.newCustomers)} new · ${formatNumber(data.metrics.returningCustomers)} returning`}
            tooltip="Derived from daily analytics snapshots. Customer identities are never merged across stores."
            href="/customers"
          />
          <MetricCard
            label="Units sold"
            value={formatCompactNumber(data.metrics.unitsSold)}
            tooltip="Total units across all orders in the period."
          />
          <MetricCard
            label="Conversion rate"
            value={data.metrics.conversionRate !== null ? formatPercent(data.metrics.conversionRate, 2) : '—'}
            unavailableReason={
              data.metrics.conversionRate === null
                ? 'No session data is available. BigCommerce does not expose storefront sessions through the management API, so this requires an analytics integration.'
                : undefined
            }
            tooltip="Orders divided by sessions, where session data exists."
          />
          <MetricCard
            label="Refund value"
            value={formatMoney(data.reportingRefunds.total, { compact: true })}
            higherIsBetter={false}
            tooltip="Refunded value, converted into the reporting currency where necessary."
          />
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title="Estate health" id="health">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Connected stores"
            value={formatNumber(data.health.total)}
            hint={`${formatNumber(data.channelCount)} storefront channel${data.channelCount === 1 ? '' : 's'}`}
            tooltip="Independent stores plus Multi-Storefront parents. Channels are counted separately."
            href="/stores"
          />
          <MetricCard
            label="Healthy stores"
            value={formatNumber(data.health.healthy)}
            tone={data.health.healthy === data.health.total ? 'success' : 'default'}
            hint={availability !== null ? `${formatPercent(availability)} of the estate` : undefined}
            tooltip="Stores whose last connection test succeeded with every required scope granted."
          />
          <MetricCard
            label="Needing attention"
            value={formatNumber(attentionCount)}
            tone={attentionCount > 0 ? 'warning' : 'default'}
            hint={`${formatNumber(data.health.critical)} critical · ${formatNumber(data.health.warning)} warning`}
            tooltip="Stores with a failed connection test, a missing scope or stale data."
            href="/stores?health=WARNING,CRITICAL"
          />
          <MetricCard
            label="Open conflicts"
            value={formatNumber(data.openConflicts)}
            tone={data.openConflicts > 20 ? 'warning' : 'default'}
            hint={`${formatNumber(data.storesDivergingFromMaster)} store${data.storesDivergingFromMaster === 1 ? '' : 's'} diverging`}
            tooltip="Differences between a store and its master that have not been resolved or accepted."
            href="/conflicts"
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Operational signals</CardTitle>
              <CardDescription>Where the estate needs an operator&rsquo;s attention.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <StatRow
                  label="Store availability"
                  value={availability !== null ? formatPercent(availability) : '—'}
                  tooltip="Share of stores whose last connection test succeeded."
                />
                <StatRow
                  label="Sync success rate"
                  value={
                    data.syncSuccessRate !== null ? (
                      formatPercent(data.syncSuccessRate)
                    ) : (
                      <span className="text-muted-foreground">No jobs in period</span>
                    )
                  }
                  tooltip="Completed jobs as a share of all jobs that reached a terminal state in this period."
                />
                <StatRow
                  label="Failed deployments"
                  value={
                    <span className={data.failedDeployments > 0 ? 'text-warning' : undefined}>
                      {formatNumber(data.failedDeployments)}
                    </span>
                  }
                />
                <StatRow
                  label="Stores with credential issues"
                  value={
                    <span className={data.health.credentialIssues > 0 ? 'text-destructive' : undefined}>
                      {formatNumber(data.health.credentialIssues)}
                    </span>
                  }
                  tooltip="Stores whose stored API token was rejected or is missing."
                />
                <StatRow
                  label="Stores with stale data"
                  value={formatNumber(data.health.staleStores)}
                  tooltip="Active stores with no successful sync in the last 48 hours."
                />
                <StatRow
                  label="Outstanding approvals"
                  value={
                    data.pendingApprovals > 0 ? (
                      <Link href="/deployments" className="text-primary hover:underline">
                        {formatNumber(data.pendingApprovals)} awaiting decision
                      </Link>
                    ) : (
                      'None'
                    )
                  }
                />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Catalog consistency</CardTitle>
              <CardDescription>
                {data.catalogConsistency.masterName
                  ? `Measured against ${data.catalogConsistency.masterName}.`
                  : 'No master store configured.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.catalogConsistency.score === null ? (
                <p className="text-sm text-muted-foreground">{data.catalogConsistency.reason}</p>
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="tabular text-3xl font-semibold tracking-tight">
                      {data.catalogConsistency.score.toFixed(1)}%
                    </span>
                    <span className="text-xs text-muted-foreground">
                      of {formatNumber(data.catalogConsistency.totalComparisons)} comparisons match
                    </span>
                  </div>
                  <Progress
                    value={data.catalogConsistency.score}
                    className="mt-3"
                    indicatorClassName={
                      data.catalogConsistency.score > 90
                        ? 'bg-success'
                        : data.catalogConsistency.score > 70
                          ? 'bg-warning'
                          : 'bg-destructive'
                    }
                  />
                  <dl className="mt-4 divide-y">
                    <StatRow label="Matching" value={formatNumber(data.catalogConsistency.matching)} />
                    <StatRow
                      label="Missing in target"
                      value={formatNumber(data.catalogConsistency.missing)}
                    />
                    <StatRow label="Diverging" value={formatNumber(data.catalogConsistency.diverging)} />
                  </dl>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Recent changes</CardTitle>
              <CardDescription>The last actions recorded in the audit log.</CardDescription>
            </CardHeader>
            <CardContent className="px-2">
              <ul className="space-y-0.5">
                {data.recentChanges.map((change) => (
                  <li key={change.id} className="rounded-md px-3 py-1.5 hover:bg-muted/50">
                    <div className="flex items-start gap-2">
                      {change.outcome === 'FAILURE' ? (
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
                      ) : change.outcome === 'DRY_RUN' ? (
                        <ClipboardCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" aria-hidden />
                      ) : change.outcome === 'PARTIAL' ? (
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
                      ) : (
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{change.label}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {change.action} · {change.actor} · {formatRelativeTime(change.at)}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="px-3 pt-2">
                <Button variant="link" size="sm" asChild className="h-auto p-0 text-xs">
                  <Link href="/audit">
                    View the full audit log <ArrowUpRight className="h-3 w-3" aria-hidden />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title="Trends" id="trends">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Revenue</CardTitle>
              <CardDescription>
                {data.trend.note ?? `Daily revenue in ${currency} across every store in scope.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.trend.points.length === 0 ? (
                <EmptyState
                  title="No revenue in this period"
                  description="Widen the date range, or check that the stores in scope have order data."
                />
              ) : (
                <RevenueTrendChart data={data.trend.points} currencyCode={currency} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Order volume</CardTitle>
              <CardDescription>Orders per day, unaffected by currency.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.trend.points.length === 0 ? (
                <EmptyState title="No orders in this period" description="Try a wider date range." />
              ) : (
                <OrdersTrendChart data={data.trend.points} />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Revenue by country</CardTitle>
              <CardDescription>Converted to {currency}.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.revenueByCountry.length === 0 ? (
                <EmptyState title="No data" description="No revenue was recorded in this period." />
              ) : (
                <HorizontalBarChart
                  data={data.revenueByCountry
                    .slice(0, 8)
                    .map((slice) => ({ label: countryName(slice.key), amount: slice.amount }))}
                  currencyCode={currency}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Revenue by brand</CardTitle>
              <CardDescription>Brand is a platform-level grouping, not a BigCommerce object.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.revenueByBrand.length === 0 ? (
                <EmptyState title="No data" description="No revenue was recorded in this period." />
              ) : (
                <DonutChart
                  data={data.revenueByBrand.map((slice) => ({ label: slice.label, amount: slice.amount }))}
                  currencyCode={currency}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Revenue by storefront</CardTitle>
              <CardDescription>Single-channel stores only — see the note below.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.revenueByChannel.length === 0 ? (
                <EmptyState
                  title="Not attributable"
                  description="Every store in scope has more than one storefront channel, and order snapshots do not carry a reliable channel attribution."
                />
              ) : (
                <>
                  <HorizontalBarChart
                    data={data.revenueByChannel
                      .slice(0, 6)
                      .map((slice) => ({ label: slice.label, amount: slice.amount }))}
                    currencyCode={currency}
                    colorIndex={3}
                  />
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    Only stores with exactly one storefront are shown. Splitting a multi-storefront store&rsquo;s
                    revenue across its channels would be a guess, so it is omitted rather than estimated.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        title="Store performance"
        description="Each store is shown in its own currency. Growth compares against the preceding period of the same length."
        id="stores"
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/stores">
              <StoreIcon className="h-4 w-4" aria-hidden />
              Open store directory
            </Link>
          </Button>
        }
      >
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Store</TableHead>
                <TableHead>Company</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">AOV</TableHead>
                <TableHead className="text-right">Refund rate</TableHead>
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
                        className="flex items-center gap-2 font-medium hover:underline"
                      >
                        <HealthDot status={store.healthStatus} />
                        <span aria-hidden>{countryFlag(store.countryCode)}</span>
                        {store.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{store.companyName}</TableCell>
                    <TableCell className="tabular text-right font-medium">
                      {formatMoney(store.revenue, { compact: true })}
                    </TableCell>
                    <TableCell className="tabular text-right">{formatNumber(store.orderCount)}</TableCell>
                    <TableCell className="tabular text-right">{formatMoney(store.averageOrderValue)}</TableCell>
                    <TableCell className="tabular text-right">
                      {store.refundRate !== null ? formatPercent(store.refundRate) : '—'}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {store.growthPercent !== null ? (
                        <span className={store.growthPercent >= 0 ? 'text-success' : 'text-destructive'}>
                          {store.growthPercent >= 0 ? '+' : ''}
                          {formatPercent(store.growthPercent)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground" title="No comparable prior period">
                          —
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </Card>

        {data.storePerformance.length > 1 ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  <ArrowUpRight className="h-4 w-4 text-success" aria-hidden />
                  Top stores by revenue
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2">
                <ol className="space-y-0.5">
                  {[...data.storePerformance]
                    .sort((a, b) => Number(b.revenue.minor - a.revenue.minor))
                    .slice(0, 5)
                    .map((store, index) => (
                      <li
                        key={store.connectionId}
                        className="flex items-center gap-3 rounded-md px-3 py-1.5 hover:bg-muted/50"
                      >
                        <span className="tabular w-4 text-xs text-muted-foreground">{index + 1}</span>
                        <Link href={`/stores/${store.connectionId}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                          {store.name}
                        </Link>
                        <span className="tabular text-sm font-medium">
                          {formatMoney(store.revenue, { compact: true })}
                        </span>
                      </li>
                    ))}
                </ol>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  <TrendingDown className="h-4 w-4 text-muted-foreground" aria-hidden />
                  Lowest-performing stores
                </CardTitle>
                <CardDescription>Ranked by revenue in each store&rsquo;s own currency.</CardDescription>
              </CardHeader>
              <CardContent className="px-2">
                <ol className="space-y-0.5">
                  {[...data.storePerformance]
                    .sort((a, b) => Number(a.revenue.minor - b.revenue.minor))
                    .slice(0, 5)
                    .map((store) => (
                      <li
                        key={store.connectionId}
                        className="flex items-center gap-3 rounded-md px-3 py-1.5 hover:bg-muted/50"
                      >
                        <HealthDot status={store.healthStatus} />
                        <Link href={`/stores/${store.connectionId}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                          {store.name}
                        </Link>
                        <span className="tabular text-sm font-medium">
                          {formatMoney(store.revenue, { compact: true })}
                        </span>
                      </li>
                    ))}
                </ol>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title="Catalog signals" id="catalog">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <Package className="h-4 w-4" aria-hidden />
                Top products
              </CardTitle>
              <CardDescription>
                Measured from order lines, converted into {currency} where necessary.
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
                            <p className="truncate font-medium">{item.name}</p>
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
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <Warehouse className="h-4 w-4" aria-hidden />
                Low and out-of-stock products
              </CardTitle>
              <CardDescription>
                Stock is store-local. Independent stores never share physical inventory.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {data.lowStock.length === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  title="Nothing running low"
                  description="Every tracked product is above its low-stock threshold."
                />
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
                        <TableCell>
                          <p className="truncate font-medium">{item.name}</p>
                          <p className="font-mono text-xs text-muted-foreground">{item.sku}</p>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          <Link href={`/stores/${item.storeId}`} className="hover:underline">
                            {item.storeName}
                          </Link>
                        </TableCell>
                        <TableCell className="tabular text-right">{item.quantity}</TableCell>
                        <TableCell>
                          <Badge variant={item.status === 'OUT_OF_STOCK' ? 'destructive' : 'warning'} size="sm">
                            {titleCase(item.status)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {(data.health.critical > 0 || data.pendingApprovals > 0 || data.openConflicts > 0) && (
        <Section title="What needs your attention" id="attention">
          <div className="grid gap-3 md:grid-cols-3">
            {data.health.critical > 0 ? (
              <Card className="border-destructive/30">
                <CardContent className="p-5">
                  <KeyRound className="mb-2 h-5 w-5 text-destructive" aria-hidden />
                  <p className="text-sm font-semibold">
                    {data.health.critical} store{data.health.critical === 1 ? '' : 's'} cannot be reached
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Their credentials were rejected or are missing. Everything shown for those stores is the
                    last successful snapshot, not live data.
                  </p>
                  <Button size="sm" variant="outline" asChild className="mt-3">
                    <Link href="/stores?health=CRITICAL">Review affected stores</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            {data.pendingApprovals > 0 ? (
              <Card className="border-warning/30">
                <CardContent className="p-5">
                  <Rocket className="mb-2 h-5 w-5 text-warning" aria-hidden />
                  <p className="text-sm font-semibold">
                    {data.pendingApprovals} deployment{data.pendingApprovals === 1 ? '' : 's'} awaiting approval
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    These changes will not reach any store until someone decides on them.
                  </p>
                  <Button size="sm" variant="outline" asChild className="mt-3">
                    <Link href="/deployments">Review approvals</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            {data.openConflicts > 0 ? (
              <Card>
                <CardContent className="p-5">
                  <GitCompareArrows className="mb-2 h-5 w-5 text-muted-foreground" aria-hidden />
                  <p className="text-sm font-semibold">{data.openConflicts} open differences</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Some are deliberate local decisions; others are unexplained drift. Resolving them keeps the
                    signal useful.
                  </p>
                  <Button size="sm" variant="outline" asChild className="mt-3">
                    <Link href="/conflicts">Open the conflict queue</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </Section>
      )}

      <InfoNote className="mb-4">
        Metrics that cannot be measured are shown as unavailable with the reason, never estimated. Conversion
        rate needs storefront session data; per-channel revenue needs channel attribution on orders. Both
        require an analytics integration rather than the BigCommerce management API.
      </InfoNote>
    </>
  );
}
