/**
 * Analytics aggregation.
 *
 * The hard rule enforced here: amounts in different currencies are never added
 * together. Every aggregate returns a `MultiCurrencyTotal`, and conversion to a
 * reporting currency only happens when an explicit rate source is supplied —
 * and is labelled when those rates are demo values.
 */
import { prisma } from '@/lib/db';
import {
  aggregateByCurrency,
  average,
  money,
  toDecimalString,
  toReportingCurrency,
  zero,
  type ConversionResult,
  type ExchangeRate,
  type Money,
  type MultiCurrencyTotal,
} from '@/lib/money';
import type { DateRange } from '@/lib/date-range';
import { serialiseMetrics } from './connections';

export type { DateRange, DateRangePreset } from '@/lib/date-range';
export { DATE_RANGE_LABELS, DATE_RANGE_PRESETS, resolveDateRange } from '@/lib/date-range';

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

export interface MetricSummary {
  revenue: MultiCurrencyTotal;
  refunds: MultiCurrencyTotal;
  orderCount: number;
  refundCount: number;
  unitsSold: number;
  newCustomers: number;
  returningCustomers: number;
  /** null when no session data exists — never invented. */
  conversionRate: number | null;
  /** Refunded value as a percentage of revenue, per currency. */
  refundRatePercent: number | null;
  averageOrderValue: MultiCurrencyTotal;
  /** True when the numbers come from seeded demo data. */
  containsDemoData: boolean;
  containsLiveData: boolean;
  storeCount: number;
}

interface SnapshotRow {
  currencyCode: string;
  revenue: string;
  refundValue: string;
  orderCount: number;
  refundCount: number;
  unitsSold: number;
  newCustomers: number;
  returningCustomers: number;
  sessions: number | null;
  source: string;
  connectionId: string | null;
}

export function summariseSnapshots(rows: readonly SnapshotRow[]): MetricSummary {
  const revenueByCurrency = new Map<string, Money>();
  const refundByCurrency = new Map<string, Money>();
  const orderCountByCurrency = new Map<string, number>();

  let orderCount = 0;
  let refundCount = 0;
  let unitsSold = 0;
  let newCustomers = 0;
  let returningCustomers = 0;
  let sessions = 0;
  let hasSessions = false;

  for (const row of rows) {
    const currency = row.currencyCode.toUpperCase();
    const revenue = money(row.revenue, currency);
    const refund = money(row.refundValue, currency);

    revenueByCurrency.set(
      currency,
      addOrSet(revenueByCurrency.get(currency), revenue, currency),
    );
    refundByCurrency.set(currency, addOrSet(refundByCurrency.get(currency), refund, currency));
    orderCountByCurrency.set(currency, (orderCountByCurrency.get(currency) ?? 0) + row.orderCount);

    orderCount += row.orderCount;
    refundCount += row.refundCount;
    unitsSold += row.unitsSold;
    newCustomers += row.newCustomers;
    returningCustomers += row.returningCustomers;
    if (row.sessions !== null) {
      sessions += row.sessions;
      hasSessions = true;
    }
  }

  const revenue = aggregateByCurrency([...revenueByCurrency.values()]);
  const refunds = aggregateByCurrency([...refundByCurrency.values()]);

  // AOV is computed per currency; a blended figure across currencies would be
  // meaningless, so it is never produced.
  const aovValues: Money[] = [];
  for (const [currency, total] of revenueByCurrency) {
    const count = orderCountByCurrency.get(currency) ?? 0;
    if (count === 0) continue;
    const perOrder = average(Array.from({ length: count }, () => total).slice(0, 1));
    // average() over a single total then divided by count keeps bigint maths exact.
    aovValues.push(
      perOrder
        ? {
            ...total,
            minor: total.minor / BigInt(count),
          }
        : zero(currency),
    );
  }

  const refundRatePercent = computeRefundRate(revenueByCurrency, refundByCurrency);

  return {
    revenue,
    refunds,
    orderCount,
    refundCount,
    unitsSold,
    newCustomers,
    returningCustomers,
    conversionRate: hasSessions && sessions > 0 ? (orderCount / sessions) * 100 : null,
    refundRatePercent,
    averageOrderValue: aggregateByCurrency(aovValues),
    containsDemoData: rows.some((row) => row.source === 'DEMO'),
    containsLiveData: rows.some((row) => row.source === 'API'),
    storeCount: new Set(rows.map((row) => row.connectionId).filter(Boolean)).size,
  };
}

function addOrSet(existing: Money | undefined, value: Money, currency: string): Money {
  if (!existing) return value;
  return { ...existing, minor: existing.minor + value.minor, currency, exponent: value.exponent };
}

function computeRefundRate(
  revenue: Map<string, Money>,
  refunds: Map<string, Money>,
): number | null {
  // Only meaningful in a single currency; across currencies it is suppressed.
  if (revenue.size !== 1) return null;
  const [currency] = [...revenue.keys()];
  const total = revenue.get(currency!);
  const refunded = refunds.get(currency!);
  if (!total || total.minor === 0n) return null;
  return Number(((refunded?.minor ?? 0n) * 10_000n) / total.minor) / 100;
}

export async function loadAnalyticsSnapshots(
  where: Record<string, unknown>,
  range: DateRange,
): Promise<SnapshotRow[]> {
  return prisma.analyticsSnapshot.findMany({
    where: { ...where, periodStart: { gte: range.from, lte: range.to } },
    select: {
      currencyCode: true,
      revenue: true,
      refundValue: true,
      orderCount: true,
      refundCount: true,
      unitsSold: true,
      newCustomers: true,
      returningCustomers: true,
      sessions: true,
      source: true,
      connectionId: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Reporting currency
// ---------------------------------------------------------------------------

/**
 * Demo exchange rates. These are fixed, illustrative values — not market data.
 * Every conversion built from them is labelled in the UI.
 */
export const DEMO_EXCHANGE_RATES: ExchangeRate[] = [
  { from: 'GBP', to: 'USD', rate: 1.27, source: 'DEMO', asOf: new Date('2026-01-01') },
  { from: 'EUR', to: 'USD', rate: 1.08, source: 'DEMO', asOf: new Date('2026-01-01') },
  { from: 'CAD', to: 'USD', rate: 0.74, source: 'DEMO', asOf: new Date('2026-01-01') },
  { from: 'AUD', to: 'USD', rate: 0.66, source: 'DEMO', asOf: new Date('2026-01-01') },
  { from: 'JPY', to: 'USD', rate: 0.0064, source: 'DEMO', asOf: new Date('2026-01-01') },
  { from: 'SEK', to: 'USD', rate: 0.096, source: 'DEMO', asOf: new Date('2026-01-01') },
  { from: 'MXN', to: 'USD', rate: 0.055, source: 'DEMO', asOf: new Date('2026-01-01') },
  { from: 'SGD', to: 'USD', rate: 0.74, source: 'DEMO', asOf: new Date('2026-01-01') },
  { from: 'AED', to: 'USD', rate: 0.27, source: 'DEMO', asOf: new Date('2026-01-01') },
];

export interface ReportingTotal extends ConversionResult {
  /** True when the caller should show the "demo rates" disclaimer. */
  requiresDisclaimer: boolean;
  formattedNote: string;
}

export function convertToReportingCurrency(
  total: MultiCurrencyTotal,
  reportingCurrency: string,
  rates: readonly ExchangeRate[] = DEMO_EXCHANGE_RATES,
): ReportingTotal {
  const result = toReportingCurrency(total, reportingCurrency, rates);
  const notes: string[] = [];

  if (result.containsDemoRates) {
    notes.push('Converted using demo exchange rates, not live market data.');
  }
  if (result.missing.length > 0) {
    notes.push(
      `${result.missing.join(', ')} excluded — no exchange rate is configured for ${result.missing.length === 1 ? 'this currency' : 'these currencies'}.`,
    );
  }
  if (notes.length === 0 && total.isMixed) {
    notes.push(`Converted from ${total.currencies.join(', ')} using configured rates.`);
  }

  return {
    ...result,
    requiresDisclaimer: result.containsDemoRates || result.missing.length > 0,
    formattedNote: notes.join(' '),
  };
}

// ---------------------------------------------------------------------------
// Rollups
// ---------------------------------------------------------------------------

/**
 * Recomputes the cached headline metrics stored on each connection, which the
 * store directory reads without touching the analytics table.
 */
export async function recomputeAnalyticsRollup(
  organisationId: string,
): Promise<{ storesProcessed: number }> {
  const connections = await prisma.storeConnection.findMany({
    where: { organisationId, deletedAt: null },
    select: { id: true, currencyCode: true },
  });

  const since = new Date(Date.now() - 30 * 86_400_000);

  for (const connection of connections) {
    const snapshots = await prisma.analyticsSnapshot.findMany({
      where: { connectionId: connection.id, periodStart: { gte: since } },
      select: {
        currencyCode: true,
        revenue: true,
        refundValue: true,
        orderCount: true,
        refundCount: true,
        unitsSold: true,
        newCustomers: true,
        returningCustomers: true,
        sessions: true,
        source: true,
        connectionId: true,
      },
    });

    const summary = summariseSnapshots(snapshots);
    const revenue =
      summary.revenue.byCurrency.get(connection.currencyCode) ?? zero(connection.currencyCode);
    const aov =
      summary.orderCount > 0
        ? { ...revenue, minor: revenue.minor / BigInt(summary.orderCount) }
        : zero(connection.currencyCode);

    await prisma.storeConnection.update({
      where: { id: connection.id },
      data: {
        metricsJson: serialiseMetrics({
          revenue: toDecimalString(revenue),
          currencyCode: connection.currencyCode,
          orders: summary.orderCount,
          aov: toDecimalString(aov),
          conversionRate: summary.conversionRate,
          refundRate: summary.refundRatePercent,
          windowDays: 30,
          computedAt: new Date().toISOString(),
        }),
      },
    });
  }

  return { storesProcessed: connections.length };
}

/** Per-store revenue, kept in each store's own currency. */
export interface StorePerformance {
  connectionId: string;
  name: string;
  countryCode: string;
  currencyCode: string;
  brandName: string | null;
  companyName: string;
  revenue: Money;
  orderCount: number;
  averageOrderValue: Money;
  refundValue: Money;
  refundRate: number | null;
  growthPercent: number | null;
  healthStatus: string;
  isDemo: boolean;
}

export async function loadStorePerformance(
  where: Record<string, unknown>,
  range: DateRange,
): Promise<StorePerformance[]> {
  const connections = await prisma.storeConnection.findMany({
    where: { ...where, deletedAt: null },
    select: {
      id: true,
      name: true,
      countryCode: true,
      currencyCode: true,
      healthStatus: true,
      isDemo: true,
      brand: { select: { name: true } },
      company: { select: { name: true } },
    },
  });

  const windowMs = range.to.getTime() - range.from.getTime();
  const previousFrom = new Date(range.from.getTime() - windowMs);

  const [current, previous] = await Promise.all([
    prisma.analyticsSnapshot.groupBy({
      by: ['connectionId', 'currencyCode'],
      where: { connectionId: { in: connections.map((c) => c.id) }, periodStart: { gte: range.from, lte: range.to } },
      _sum: { orderCount: true },
    }),
    prisma.analyticsSnapshot.groupBy({
      by: ['connectionId'],
      where: {
        connectionId: { in: connections.map((c) => c.id) },
        periodStart: { gte: previousFrom, lt: range.from },
      },
      _sum: { orderCount: true },
    }),
  ]);

  // Money must be summed exactly, so the amounts are fetched as rows rather
  // than aggregated by the database as floats.
  const rows = await prisma.analyticsSnapshot.findMany({
    where: {
      connectionId: { in: connections.map((c) => c.id) },
      periodStart: { gte: previousFrom, lte: range.to },
    },
    select: {
      connectionId: true,
      currencyCode: true,
      revenue: true,
      refundValue: true,
      orderCount: true,
      periodStart: true,
    },
  });

  const currentOrders = new Map(current.map((row) => [row.connectionId, row._sum.orderCount ?? 0]));
  const previousOrders = new Map(previous.map((row) => [row.connectionId, row._sum.orderCount ?? 0]));

  return connections.map((connection) => {
    const currency = connection.currencyCode;
    let revenue = zero(currency);
    let refunds = zero(currency);
    let previousRevenueMinor = 0n;

    for (const row of rows) {
      if (row.connectionId !== connection.id) continue;
      const amount = money(row.revenue, row.currencyCode);
      const refund = money(row.refundValue, row.currencyCode);
      if (row.periodStart >= range.from) {
        if (row.currencyCode === currency) {
          revenue = { ...revenue, minor: revenue.minor + amount.minor };
          refunds = { ...refunds, minor: refunds.minor + refund.minor };
        }
      } else if (row.currencyCode === currency) {
        previousRevenueMinor += amount.minor;
      }
    }

    const orderCount = currentOrders.get(connection.id) ?? 0;
    const priorOrders = previousOrders.get(connection.id) ?? 0;

    return {
      connectionId: connection.id,
      name: connection.name,
      countryCode: connection.countryCode,
      currencyCode: currency,
      brandName: connection.brand?.name ?? null,
      companyName: connection.company.name,
      revenue,
      orderCount,
      averageOrderValue:
        orderCount > 0 ? { ...revenue, minor: revenue.minor / BigInt(orderCount) } : zero(currency),
      refundValue: refunds,
      refundRate:
        revenue.minor > 0n ? Number((refunds.minor * 10_000n) / revenue.minor) / 100 : null,
      growthPercent:
        previousRevenueMinor > 0n
          ? Number(((revenue.minor - previousRevenueMinor) * 10_000n) / previousRevenueMinor) / 100
          : priorOrders === 0 && orderCount > 0
            ? null
            : null,
      healthStatus: connection.healthStatus,
      isDemo: connection.isDemo,
    };
  });
}

/** Time series for charts, grouped by day and kept per currency. */
export interface TrendPoint {
  date: string;
  revenue: number;
  orders: number;
  currencyCode: string;
}

export async function loadRevenueTrend(
  where: Record<string, unknown>,
  range: DateRange,
  reportingCurrency: string,
): Promise<{ points: TrendPoint[]; isConverted: boolean; note: string | null }> {
  const rows = await prisma.analyticsSnapshot.findMany({
    where: { ...where, periodStart: { gte: range.from, lte: range.to } },
    select: { periodStart: true, revenue: true, orderCount: true, currencyCode: true },
    orderBy: { periodStart: 'asc' },
  });

  const byDate = new Map<string, { minor: bigint; orders: number }>();
  const currencies = new Set(rows.map((row) => row.currencyCode));
  let conversionUsed = false;

  for (const row of rows) {
    const key = row.periodStart.toISOString().slice(0, 10);
    const amount = money(row.revenue, row.currencyCode);
    let contribution = amount;

    if (row.currencyCode !== reportingCurrency) {
      const converted = convertToReportingCurrency(
        aggregateByCurrency([amount]),
        reportingCurrency,
      );
      if (converted.missing.length > 0) continue; // excluded rather than mis-added
      contribution = converted.total;
      conversionUsed = true;
    }

    const existing = byDate.get(key) ?? { minor: 0n, orders: 0 };
    byDate.set(key, {
      minor: existing.minor + contribution.minor,
      orders: existing.orders + row.orderCount,
    });
  }

  const points = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({
      date,
      revenue: Number(toDecimalString({ minor: value.minor, currency: reportingCurrency, exponent: 2 })),
      orders: value.orders,
      currencyCode: reportingCurrency,
    }));

  return {
    points,
    isConverted: conversionUsed,
    note: conversionUsed
      ? `Amounts in ${[...currencies].filter((code) => code !== reportingCurrency).join(', ')} were converted to ${reportingCurrency} using demo exchange rates.`
      : null,
  };
}
