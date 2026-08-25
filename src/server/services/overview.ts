/**
 * The executive dashboard's data loader.
 *
 * Assembles every headline number in one pass and, crucially, records for each
 * one whether it is measured, derived or unavailable. Nothing on the dashboard
 * is invented: a metric with no source renders as "unavailable" with a reason.
 */
import { prisma } from '@/lib/db';
import {
  aggregateByCurrency,
  money,
  toDecimalString,
  zero,
  type Money,
  type MultiCurrencyTotal,
} from '@/lib/money';
import { tenantWhere, type TenantScope } from '@/lib/tenancy';
import { summariseHealth, type HealthSummary } from './connections';
import {
  convertToReportingCurrency,
  loadAnalyticsSnapshots,
  loadRevenueTrend,
  loadStorePerformance,
  summariseSnapshots,
  type DateRange,
  type MetricSummary,
  type StorePerformance,
  type TrendPoint,
} from './analytics';

export interface DimensionSlice {
  key: string;
  label: string;
  /** Converted into the reporting currency; `isConverted` says whether that happened. */
  amount: number;
  currencyCode: string;
  orderCount: number;
  storeCount: number;
  isConverted: boolean;
}

export interface CatalogConsistency {
  /** 0–100. The share of master SKUs that are present and matching in targets. */
  score: number | null;
  masterName: string | null;
  totalComparisons: number;
  matching: number;
  missing: number;
  diverging: number;
  reason?: string;
}

export interface TopProduct {
  sku: string;
  name: string;
  storeCount: number;
  unitsSold: number;
  revenue: number;
  currencyCode: string;
}

export interface LowStockProduct {
  sku: string;
  name: string;
  storeName: string;
  storeId: string;
  quantity: number;
  threshold: number;
  status: string;
}

export interface RecentChange {
  id: string;
  action: string;
  label: string;
  outcome: string;
  actor: string;
  at: Date;
  storeName: string | null;
}

export interface OverviewData {
  range: DateRange;
  reportingCurrency: string;
  metrics: MetricSummary;
  previousMetrics: MetricSummary;
  revenueTotal: MultiCurrencyTotal;
  reportingRevenue: ReturnType<typeof convertToReportingCurrency>;
  reportingRefunds: ReturnType<typeof convertToReportingCurrency>;
  revenueDeltaPercent: number | null;
  orderDeltaPercent: number | null;
  aovByCurrency: { currencyCode: string; amount: Money }[];
  health: HealthSummary;
  channelCount: number;
  activeChannelCount: number;
  syncSuccessRate: number | null;
  failedDeployments: number;
  storesDivergingFromMaster: number;
  openConflicts: number;
  pendingApprovals: number;
  catalogConsistency: CatalogConsistency;
  storePerformance: StorePerformance[];
  revenueByCountry: DimensionSlice[];
  revenueByBrand: DimensionSlice[];
  revenueByChannel: DimensionSlice[];
  trend: { points: TrendPoint[]; isConverted: boolean; note: string | null };
  topProducts: TopProduct[];
  lowStock: LowStockProduct[];
  recentChanges: RecentChange[];
  containsDemoData: boolean;
  containsLiveData: boolean;
}

export async function loadOverview(scope: TenantScope, range: DateRange): Promise<OverviewData> {
  const where = tenantWhere(scope);
  const storeWhere = { ...where, deletedAt: null };

  const organisation = await prisma.organisation.findUniqueOrThrow({
    where: { id: scope.organisationId },
    select: { reportingCurrency: true },
  });
  const reportingCurrency = organisation.reportingCurrency;

  const connections = await prisma.storeConnection.findMany({
    where: storeWhere,
    select: {
      id: true,
      name: true,
      countryCode: true,
      currencyCode: true,
      masterConnectionId: true,
      hierarchyMode: true,
      brand: { select: { name: true } },
      environment: { select: { isProduction: true } },
    },
  });
  const storeIds = connections.map((connection) => connection.id);
  const analyticsWhere = { organisationId: scope.organisationId, connectionId: { in: storeIds } };

  const windowMs = range.to.getTime() - range.from.getTime();
  const previousRange: DateRange = {
    from: new Date(range.from.getTime() - windowMs),
    to: new Date(range.from.getTime() - 1),
    label: 'Previous period',
  };

  const [
    currentRows,
    previousRows,
    health,
    channels,
    jobStats,
    failedDeployments,
    openConflicts,
    pendingApprovals,
    performance,
    trend,
    recentAudit,
  ] = await Promise.all([
    loadAnalyticsSnapshots(analyticsWhere, range),
    loadAnalyticsSnapshots(analyticsWhere, previousRange),
    summariseHealth(where),
    prisma.storefrontChannel.findMany({
      where: { organisationId: scope.organisationId, connectionId: { in: storeIds }, deletedAt: null },
      select: { id: true, name: true, status: true, connectionId: true, currencyCode: true },
    }),
    prisma.syncJob.groupBy({
      by: ['status'],
      where: { organisationId: scope.organisationId, createdAt: { gte: range.from } },
      _count: { _all: true },
    }),
    prisma.deployment.count({
      where: { organisationId: scope.organisationId, status: { in: ['FAILED', 'PARTIAL'] } },
    }),
    prisma.conflict.count({
      where: {
        organisationId: scope.organisationId,
        targetConnectionId: { in: storeIds },
        status: { in: ['OPEN', 'ACKNOWLEDGED'] },
      },
    }),
    prisma.approvalRequest.count({
      where: { organisationId: scope.organisationId, status: 'PENDING' },
    }),
    loadStorePerformance(where, range),
    loadRevenueTrend(analyticsWhere, range, reportingCurrency),
    prisma.auditEvent.findMany({
      where: { organisationId: scope.organisationId },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        action: true,
        resourceLabel: true,
        outcome: true,
        actorLabel: true,
        createdAt: true,
        connection: { select: { name: true } },
      },
    }),
  ]);

  const metrics = summariseSnapshots(currentRows);
  const previousMetrics = summariseSnapshots(previousRows);

  const reportingRevenue = convertToReportingCurrency(metrics.revenue, reportingCurrency);
  const reportingRefunds = convertToReportingCurrency(metrics.refunds, reportingCurrency);
  const previousReporting = convertToReportingCurrency(previousMetrics.revenue, reportingCurrency);

  const revenueDeltaPercent =
    previousReporting.total.minor > 0n
      ? Number(
          ((reportingRevenue.total.minor - previousReporting.total.minor) * 10_000n) /
            previousReporting.total.minor,
        ) / 100
      : null;

  const orderDeltaPercent =
    previousMetrics.orderCount > 0
      ? ((metrics.orderCount - previousMetrics.orderCount) / previousMetrics.orderCount) * 100
      : null;

  // Sync success rate, only when there is something to measure.
  const totalTerminalJobs = jobStats
    .filter((entry) => ['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(entry.status))
    .reduce((total, entry) => total + entry._count._all, 0);
  const succeededJobs = jobStats
    .filter((entry) => entry.status === 'COMPLETED')
    .reduce((total, entry) => total + entry._count._all, 0);
  const syncSuccessRate = totalTerminalJobs > 0 ? (succeededJobs / totalTerminalJobs) * 100 : null;

  const divergingStores = await prisma.conflict.groupBy({
    by: ['targetConnectionId'],
    where: {
      organisationId: scope.organisationId,
      targetConnectionId: { in: storeIds },
      status: { in: ['OPEN', 'ACKNOWLEDGED'] },
    },
  });

  const catalogConsistency = await computeCatalogConsistency(scope, storeIds);

  const [revenueByCountry, revenueByBrand, revenueByChannel] = await Promise.all([
    sliceRevenue(performance, reportingCurrency, (store) => ({
      key: store.countryCode,
      label: store.countryCode,
    })),
    sliceRevenue(performance, reportingCurrency, (store) => ({
      key: store.brandName ?? 'Unbranded',
      label: store.brandName ?? 'No brand assigned',
    })),
    sliceRevenueByChannel(performance, channels, reportingCurrency),
  ]);

  const [topProducts, lowStock] = await Promise.all([
    loadTopProducts(scope, storeIds, reportingCurrency),
    loadLowStock(scope, storeIds),
  ]);

  const aovByCurrency = [...metrics.averageOrderValue.byCurrency.entries()].map(
    ([currencyCode, amount]) => ({ currencyCode, amount }),
  );

  return {
    range,
    reportingCurrency,
    metrics,
    previousMetrics,
    revenueTotal: metrics.revenue,
    reportingRevenue,
    reportingRefunds,
    revenueDeltaPercent,
    orderDeltaPercent,
    aovByCurrency,
    health,
    channelCount: channels.length,
    activeChannelCount: channels.filter((channel) => channel.status === 'active').length,
    syncSuccessRate,
    failedDeployments,
    storesDivergingFromMaster: divergingStores.length,
    openConflicts,
    pendingApprovals,
    catalogConsistency,
    storePerformance: performance,
    revenueByCountry,
    revenueByBrand,
    revenueByChannel,
    trend,
    topProducts,
    lowStock,
    recentChanges: recentAudit.map((event) => ({
      id: event.id,
      action: event.action,
      label: event.resourceLabel ?? event.action,
      outcome: event.outcome,
      actor: event.actorLabel ?? 'System',
      at: event.createdAt,
      storeName: event.connection?.name ?? null,
    })),
    containsDemoData: metrics.containsDemoData,
    containsLiveData: metrics.containsLiveData,
  };
}

async function computeCatalogConsistency(
  scope: TenantScope,
  storeIds: string[],
): Promise<CatalogConsistency> {
  const master = await prisma.storeConnection.findFirst({
    where: { organisationId: scope.organisationId, hierarchyMode: 'MASTER', deletedAt: null },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!master) {
    return {
      score: null,
      masterName: null,
      totalComparisons: 0,
      matching: 0,
      missing: 0,
      diverging: 0,
      reason: 'No master store is configured, so there is nothing to measure consistency against.',
    };
  }

  const mappings = await prisma.productMapping.findMany({
    where: {
      organisationId: scope.organisationId,
      masterConnectionId: master.id,
      targetConnectionId: { in: storeIds },
    },
    select: { mappingStatus: true, driftFieldsJson: true },
  });

  if (mappings.length === 0) {
    return {
      score: null,
      masterName: master.name,
      totalComparisons: 0,
      matching: 0,
      missing: 0,
      diverging: 0,
      reason: 'No product mappings exist yet. Run a comparison scan to build them.',
    };
  }

  const missing = mappings.filter((mapping) => mapping.mappingStatus === 'MISSING_IN_TARGET').length;
  const diverging = mappings.filter((mapping) => {
    if (mapping.mappingStatus !== 'MAPPED') return false;
    try {
      return (JSON.parse(mapping.driftFieldsJson) as string[]).length > 0;
    } catch {
      return false;
    }
  }).length;
  const matching = mappings.length - missing - diverging;

  return {
    score: Math.round((matching / mappings.length) * 1000) / 10,
    masterName: master.name,
    totalComparisons: mappings.length,
    matching,
    missing,
    diverging,
  };
}

async function sliceRevenue(
  performance: StorePerformance[],
  reportingCurrency: string,
  keyOf: (store: StorePerformance) => { key: string; label: string },
): Promise<DimensionSlice[]> {
  const buckets = new Map<
    string,
    { label: string; amounts: Money[]; orders: number; stores: Set<string> }
  >();

  for (const store of performance) {
    const { key, label } = keyOf(store);
    const bucket = buckets.get(key) ?? { label, amounts: [], orders: 0, stores: new Set<string>() };
    bucket.amounts.push(store.revenue);
    bucket.orders += store.orderCount;
    bucket.stores.add(store.connectionId);
    buckets.set(key, bucket);
  }

  return [...buckets.entries()]
    .map(([key, bucket]) => {
      const total = aggregateByCurrency(bucket.amounts);
      const converted = convertToReportingCurrency(total, reportingCurrency);
      return {
        key,
        label: bucket.label,
        amount: Number(toDecimalString(converted.total)),
        currencyCode: reportingCurrency,
        orderCount: bucket.orders,
        storeCount: bucket.stores.size,
        isConverted: converted.converted.length > 0,
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

async function sliceRevenueByChannel(
  performance: StorePerformance[],
  channels: { id: string; name: string; connectionId: string; status: string }[],
  reportingCurrency: string,
): Promise<DimensionSlice[]> {
  // Channel-level revenue is not measured separately in the snapshots, so
  // revenue is attributed to a store's channels rather than invented per
  // channel. Single-channel stores are exact; multi-channel stores are marked.
  const byStore = new Map(performance.map((store) => [store.connectionId, store]));
  const channelsByStore = new Map<string, typeof channels>();
  for (const channel of channels) {
    channelsByStore.set(channel.connectionId, [...(channelsByStore.get(channel.connectionId) ?? []), channel]);
  }

  const slices: DimensionSlice[] = [];
  for (const [connectionId, storeChannels] of channelsByStore) {
    const store = byStore.get(connectionId);
    if (!store) continue;
    // Only attribute where a store has exactly one channel; otherwise the split
    // would be a guess.
    if (storeChannels.length !== 1) continue;
    const channel = storeChannels[0]!;
    const converted = convertToReportingCurrency(
      aggregateByCurrency([store.revenue]),
      reportingCurrency,
    );
    slices.push({
      key: channel.id,
      label: channel.name,
      amount: Number(toDecimalString(converted.total)),
      currencyCode: reportingCurrency,
      orderCount: store.orderCount,
      storeCount: 1,
      isConverted: converted.converted.length > 0,
    });
  }

  return slices.sort((a, b) => b.amount - a.amount).slice(0, 10);
}

async function loadTopProducts(
  scope: TenantScope,
  storeIds: string[],
  reportingCurrency: string,
): Promise<TopProduct[]> {
  // Line-level revenue is exact, so this is measured rather than estimated.
  const lines = await prisma.orderLineSnapshot.findMany({
    where: { order: { organisationId: scope.organisationId, connectionId: { in: storeIds } } },
    select: {
      sku: true,
      name: true,
      quantity: true,
      lineTotal: true,
      order: { select: { currencyCode: true, connectionId: true } },
    },
    take: 4000,
  });

  const buckets = new Map<
    string,
    { name: string; units: number; amounts: Money[]; stores: Set<string> }
  >();

  for (const line of lines) {
    const bucket = buckets.get(line.sku) ?? {
      name: line.name,
      units: 0,
      amounts: [] as Money[],
      stores: new Set<string>(),
    };
    bucket.units += line.quantity;
    bucket.amounts.push(money(line.lineTotal, line.order.currencyCode));
    bucket.stores.add(line.order.connectionId);
    buckets.set(line.sku, bucket);
  }

  return [...buckets.entries()]
    .map(([sku, bucket]) => {
      const converted = convertToReportingCurrency(
        aggregateByCurrency(bucket.amounts),
        reportingCurrency,
      );
      return {
        sku,
        name: bucket.name,
        storeCount: bucket.stores.size,
        unitsSold: bucket.units,
        revenue: Number(toDecimalString(converted.total)),
        currencyCode: reportingCurrency,
      };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);
}

async function loadLowStock(scope: TenantScope, storeIds: string[]): Promise<LowStockProduct[]> {
  const records = await prisma.inventoryRecord.findMany({
    where: {
      organisationId: scope.organisationId,
      connectionId: { in: storeIds },
      status: { in: ['LOW', 'OUT_OF_STOCK'] },
    },
    orderBy: [{ quantity: 'asc' }],
    take: 12,
    select: {
      sku: true,
      productName: true,
      quantity: true,
      lowStockThreshold: true,
      status: true,
      connectionId: true,
      connection: { select: { name: true } },
    },
  });

  return records.map((record) => ({
    sku: record.sku,
    name: record.productName ?? record.sku,
    storeName: record.connection.name,
    storeId: record.connectionId,
    quantity: record.quantity,
    threshold: record.lowStockThreshold,
    status: record.status,
  }));
}

/** Zero amount in the reporting currency, for empty states. */
export function zeroIn(currency: string): Money {
  return zero(currency);
}
