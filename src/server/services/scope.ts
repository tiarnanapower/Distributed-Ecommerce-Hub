/**
 * Loads everything the app shell needs: the scope selectors' options, the
 * badge counts, the notification list and the feature flags.
 *
 * Every query goes through `tenantWhere`, so the shell can never leak another
 * organisation's data into a selector.
 */
import { cache } from 'react';

import { prisma } from '@/lib/db';
import { developmentWarnings, product } from '@/lib/config';
import { canAccessCompany, tenantWhere, type TenantScope } from '@/lib/tenancy';
import { describeCommerceMode } from './provider-factory';

export interface ScopeOption {
  id: string;
  name: string;
  meta?: string;
}

export interface StoreScopeOption extends ScopeOption {
  companyId: string;
  healthStatus: string;
  isMaster: boolean;
  hierarchyMode: string;
  countryCode: string;
  channels: { id: string; name: string; status: string }[];
}

export interface ShellData {
  productName: string;
  organisation: { id: string; name: string; initials: string; reportingCurrency: string };
  companies: ScopeOption[];
  stores: StoreScopeOption[];
  storeGroups: ScopeOption[];
  active: {
    companyId: string | null;
    companyName: string | null;
    storeId: string | null;
    storeName: string | null;
    channelId: string | null;
    channelName: string | null;
  };
  counts: {
    openConflicts: number;
    runningJobs: number;
    pendingApprovals: number;
    unreadNotifications: number;
    unhealthyStores: number;
  };
  notifications: {
    id: string;
    type: string;
    severity: string;
    title: string;
    body: string;
    actionLabel: string | null;
    actionHref: string | null;
    isRead: boolean;
    createdAt: Date;
  }[];
  featureFlags: Record<string, boolean>;
  mode: ReturnType<typeof describeCommerceMode>;
  developmentWarnings: string[];
}

export const loadShellData = cache(async (scope: TenantScope): Promise<ShellData> => {
  const where = tenantWhere(scope);

  const [organisation, companies, stores, storeGroups, notifications, flags] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({
      where: { id: scope.organisationId },
      select: { id: true, name: true, logoInitials: true, reportingCurrency: true },
    }),
    prisma.company.findMany({
      where: {
        organisationId: scope.organisationId,
        deletedAt: null,
        ...(scope.allowedCompanyIds.length > 0 ? { id: { in: scope.allowedCompanyIds } } : {}),
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true, businessModel: true, _count: { select: { connections: true } } },
    }),
    prisma.storeConnection.findMany({
      where: { ...where, deletedAt: null },
      orderBy: [{ hierarchyMode: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        companyId: true,
        countryCode: true,
        healthStatus: true,
        hierarchyMode: true,
        currencyCode: true,
        channels: {
          where: { deletedAt: null },
          select: { id: true, name: true, status: true },
          orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        },
      },
    }),
    prisma.storeGroup.findMany({
      where: {
        organisationId: scope.organisationId,
        deletedAt: null,
        ...(scope.companyId ? { OR: [{ companyId: scope.companyId }, { companyId: null }] } : {}),
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, purpose: true, _count: { select: { members: true } } },
    }),
    prisma.notification.findMany({
      where: { organisationId: scope.organisationId },
      orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
      take: 20,
      select: {
        id: true,
        type: true,
        severity: true,
        title: true,
        body: true,
        actionLabel: true,
        actionHref: true,
        isRead: true,
        createdAt: true,
      },
    }),
    prisma.featureFlag.findMany({
      where: { organisationId: scope.organisationId },
      select: { key: true, isEnabled: true },
    }),
  ]);

  const storeIds = stores.map((store) => store.id);

  const [openConflicts, runningJobs, pendingApprovals, unreadNotifications, unhealthyStores] =
    await Promise.all([
      prisma.conflict.count({
        where: {
          organisationId: scope.organisationId,
          status: { in: ['OPEN', 'ACKNOWLEDGED'] },
          targetConnectionId: { in: storeIds },
        },
      }),
      prisma.syncJob.count({
        where: { organisationId: scope.organisationId, status: { in: ['QUEUED', 'RUNNING'] } },
      }),
      prisma.approvalRequest.count({
        where: { organisationId: scope.organisationId, status: 'PENDING' },
      }),
      prisma.notification.count({ where: { organisationId: scope.organisationId, isRead: false } }),
      prisma.storeConnection.count({
        where: { ...where, deletedAt: null, healthStatus: { in: ['WARNING', 'CRITICAL'] } },
      }),
    ]);

  const activeStore = scope.storeId ? stores.find((store) => store.id === scope.storeId) : null;
  const activeChannel = scope.channelId
    ? (activeStore?.channels.find((channel) => channel.id === scope.channelId) ?? null)
    : null;
  const activeCompany = scope.companyId
    ? (companies.find((company) => company.id === scope.companyId) ?? null)
    : null;

  return {
    productName: product.name,
    organisation: {
      id: organisation.id,
      name: organisation.name,
      initials: organisation.logoInitials,
      reportingCurrency: organisation.reportingCurrency,
    },
    companies: companies.map((company) => ({
      id: company.id,
      name: company.name,
      meta: `${company.businessModel} · ${company._count.connections} store${company._count.connections === 1 ? '' : 's'}`,
    })),
    stores: stores.map((store) => ({
      id: store.id,
      name: store.name,
      companyId: store.companyId,
      healthStatus: store.healthStatus,
      hierarchyMode: store.hierarchyMode,
      isMaster: store.hierarchyMode === 'MASTER' || store.hierarchyMode === 'MSF_PARENT',
      countryCode: store.countryCode,
      meta: `${store.countryCode} · ${store.currencyCode}`,
      channels: store.channels,
    })),
    storeGroups: storeGroups.map((group) => ({
      id: group.id,
      name: group.name,
      meta: `${group._count.members} store${group._count.members === 1 ? '' : 's'}`,
    })),
    active: {
      companyId: scope.companyId,
      companyName: activeCompany?.name ?? null,
      storeId: scope.storeId,
      storeName: activeStore?.name ?? null,
      channelId: scope.channelId,
      channelName: activeChannel?.name ?? null,
    },
    counts: {
      openConflicts,
      runningJobs,
      pendingApprovals,
      unreadNotifications,
      unhealthyStores,
    },
    notifications,
    featureFlags: Object.fromEntries(flags.map((flag) => [flag.key, flag.isEnabled])),
    mode: describeCommerceMode(),
    developmentWarnings: developmentWarnings(),
  };
});

/**
 * Resolves the set of store ids the current scope covers. Every page that
 * aggregates across stores starts here rather than querying connections again.
 */
export async function storeIdsInScope(scope: TenantScope): Promise<string[]> {
  if (scope.storeId) return [scope.storeId];

  const stores = await prisma.storeConnection.findMany({
    where: { ...tenantWhere(scope), deletedAt: null },
    select: { id: true },
  });
  return stores.map((store) => store.id);
}

/** Scope description for page subtitles: "Acme Consumer · Acme US". */
export function describeScope(shell: ShellData): string {
  const parts: string[] = [];
  parts.push(shell.active.companyName ?? 'All companies');
  if (shell.active.storeName) parts.push(shell.active.storeName);
  if (shell.active.channelName) parts.push(shell.active.channelName);
  return parts.join(' · ');
}

export function assertCompanyInScope(scope: TenantScope, companyId: string): boolean {
  return canAccessCompany(scope, companyId);
}
