/**
 * Store directory and store-detail loaders.
 */
import { prisma } from '@/lib/db';
import { parseJsonLoose } from '@/lib/json';
import { assertTenantAccess, tenantWhere, type TenantScope } from '@/lib/tenancy';
import { storeMetrics } from './connections';

export interface StoreDirectoryRow {
  id: string;
  name: string;
  slug: string;
  storeHash: string | null;
  companyName: string;
  companyId: string;
  regionName: string | null;
  brandName: string | null;
  environmentName: string | null;
  isProduction: boolean;
  countryCode: string;
  currencyCode: string;
  locale: string;
  connectionType: string;
  hierarchyMode: string;
  classification: string;
  masterName: string | null;
  templateName: string | null;
  status: string;
  healthStatus: string;
  healthMessage: string | null;
  isDemo: boolean;
  msfEnabled: boolean;
  channelCount: number;
  activeChannelCount: number;
  storefrontLimit: number | null;
  storefrontsUsed: number | null;
  themeName: string | null;
  themeVersion: string | null;
  catalogVersion: string | null;
  productCount: number;
  openConflicts: number;
  overrideCount: number;
  lastSuccessfulSyncAt: Date | null;
  lastFailedSyncAt: Date | null;
  lastErrorSummary: string | null;
  primaryDomain: string | null;
  controlPanelUrl: string | null;
  revenue: string;
  orders: number;
  aov: string;
  notes: string | null;
}

export async function loadStoreDirectory(scope: TenantScope): Promise<StoreDirectoryRow[]> {
  const connections = await prisma.storeConnection.findMany({
    where: { ...tenantWhere(scope), deletedAt: null },
    orderBy: [{ hierarchyMode: 'asc' }, { name: 'asc' }],
    include: {
      company: { select: { id: true, name: true } },
      region: { select: { name: true } },
      brand: { select: { name: true } },
      environment: { select: { name: true, isProduction: true } },
      master: { select: { name: true } },
      template: { select: { name: true } },
      channels: { where: { deletedAt: null }, select: { id: true, status: true } },
      _count: {
        select: { products: true, overrides: true, conflictsAsTarget: true },
      },
    },
  });

  // Open conflicts need a status filter, which `_count` cannot express.
  const openConflicts = await prisma.conflict.groupBy({
    by: ['targetConnectionId'],
    where: {
      organisationId: scope.organisationId,
      targetConnectionId: { in: connections.map((connection) => connection.id) },
      status: { in: ['OPEN', 'ACKNOWLEDGED'] },
    },
    _count: { _all: true },
  });
  const conflictCounts = new Map(
    openConflicts.map((entry) => [entry.targetConnectionId, entry._count._all]),
  );

  return connections.map((connection) => {
    const metrics = storeMetrics(connection.metricsJson);
    return {
      id: connection.id,
      name: connection.name,
      slug: connection.slug,
      storeHash: connection.storeHash,
      companyName: connection.company.name,
      companyId: connection.company.id,
      regionName: connection.region?.name ?? null,
      brandName: connection.brand?.name ?? null,
      environmentName: connection.environment?.name ?? null,
      isProduction: connection.environment?.isProduction ?? false,
      countryCode: connection.countryCode,
      currencyCode: connection.currencyCode,
      locale: connection.locale,
      connectionType: connection.connectionType,
      hierarchyMode: connection.hierarchyMode,
      classification: connection.classification,
      masterName: connection.master?.name ?? null,
      templateName: connection.template?.name ?? null,
      status: connection.status,
      healthStatus: connection.healthStatus,
      healthMessage: connection.healthMessage,
      isDemo: connection.isDemo,
      msfEnabled: connection.msfEnabled,
      channelCount: connection.channels.length,
      activeChannelCount: connection.channels.filter((channel) => channel.status === 'active').length,
      storefrontLimit: connection.storefrontLimit,
      storefrontsUsed: connection.storefrontsUsed,
      themeName: connection.activeThemeName,
      themeVersion: connection.activeThemeVersion,
      catalogVersion: connection.catalogVersion,
      productCount: connection._count.products,
      openConflicts: conflictCounts.get(connection.id) ?? 0,
      overrideCount: connection._count.overrides,
      lastSuccessfulSyncAt: connection.lastSuccessfulSyncAt,
      lastFailedSyncAt: connection.lastFailedSyncAt,
      lastErrorSummary: connection.lastErrorSummary,
      primaryDomain: connection.primaryDomain,
      controlPanelUrl: connection.controlPanelUrl,
      revenue: metrics.revenue,
      orders: metrics.orders,
      aov: metrics.aov,
      notes: connection.notes,
    };
  });
}

export async function loadStoreDetail(scope: TenantScope, id: string) {
  const connection = await prisma.storeConnection.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, name: true, businessModel: true } },
      region: { select: { id: true, name: true, code: true } },
      brand: { select: { id: true, name: true, colorHex: true } },
      environment: { select: { id: true, name: true, isProduction: true, guardrailLevel: true } },
      master: { select: { id: true, name: true, currencyCode: true, hierarchyMode: true } },
      children: { select: { id: true, name: true, healthStatus: true, countryCode: true } },
      template: { select: { id: true, name: true, version: true } },
      channels: {
        where: { deletedAt: null },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      },
      credentials: { orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] },
      capabilities: { orderBy: { capabilityKey: 'asc' } },
      overrides: { orderBy: { setAt: 'desc' }, include: { setBy: { select: { name: true } } } },
      groupMemberships: { include: { storeGroup: { select: { id: true, name: true, purpose: true } } } },
      themeAssignments: { include: { release: { select: { id: true, name: true, version: true, status: true } } } },
      manualActions: { where: { status: { not: 'COMPLETED' } }, orderBy: { createdAt: 'desc' } },
      _count: { select: { products: true, orders: true, customers: true, promotions: true } },
    },
  });

  assertTenantAccess(connection, scope, 'store');
  return connection!;
}

export type StoreDetail = Awaited<ReturnType<typeof loadStoreDetail>>;

export function parseMetrics(metricsJson: string) {
  return storeMetrics(metricsJson);
}

export function parseThemeConfig(json: string): Record<string, unknown> {
  return parseJsonLoose<Record<string, unknown>>(json, {});
}
