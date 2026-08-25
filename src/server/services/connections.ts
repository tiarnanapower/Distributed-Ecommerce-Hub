/**
 * Store-connection lifecycle: testing, metadata refresh, capability
 * verification, reconnect, rotation and disconnect.
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { stringifyJson } from '@/lib/json';
import { CAPABILITY_DEFINITIONS } from '@/lib/commerce/capability-registry';
import type { CapabilityKey } from '@/lib/commerce/capability-keys';
import { tryGetProviderFor } from './provider-factory';
import { markCredentialValidated, revokeCredentials } from './credentials';
import { notify } from './notifications';

export interface OperationOutcome {
  ok: boolean;
  message: string;
  detail?: string;
}

/**
 * Runs a live (or simulated) connection test and records the result on the
 * connection, the credential and the notification centre.
 */
export async function testStoreConnection(
  connectionId: string,
  correlationId?: string,
): Promise<OperationOutcome & { latencyMs?: number; grantedScopes?: string[]; missingScopes?: string[]; isSimulated?: boolean }> {
  const handle = await tryGetProviderFor(connectionId);
  if (!handle.ok) {
    await prisma.storeConnection.update({
      where: { id: connectionId },
      data: {
        healthStatus: 'CRITICAL',
        healthMessage: handle.error.message,
        lastFailedSyncAt: new Date(),
        lastErrorSummary: handle.error.message,
      },
    });
    return { ok: false, message: handle.error.message, detail: handle.error.hint };
  }

  const result = await handle.handle.provider.testConnection();

  await prisma.storeConnection.update({
    where: { id: connectionId },
    data: {
      healthStatus: result.ok ? (result.missingScopes.length > 0 ? 'WARNING' : 'HEALTHY') : 'CRITICAL',
      healthMessage: result.message,
      status: result.ok ? 'ACTIVE' : 'DEGRADED',
      lastVerifiedAt: result.checkedAt,
      ...(result.ok
        ? { lastSuccessfulSyncAt: result.checkedAt, lastErrorSummary: null }
        : { lastFailedSyncAt: result.checkedAt, lastErrorSummary: result.message }),
    },
  });

  if (handle.handle.source === 'LIVE') {
    await markCredentialValidated(connectionId, {
      ok: result.ok,
      scopes: result.grantedScopes,
      error: result.ok ? undefined : result.message,
    });
  }

  if (!result.ok) {
    const connection = await prisma.storeConnection.findUniqueOrThrow({
      where: { id: connectionId },
      select: { organisationId: true, companyId: true, name: true },
    });
    await notify({
      organisationId: connection.organisationId,
      companyId: connection.companyId,
      connectionId,
      type: result.errorCode === 'CREDENTIAL_INVALID' ? 'TOKEN_INVALID' : 'CONNECTION_FAILURE',
      severity: 'CRITICAL',
      title: `${connection.name} failed its connection test`,
      body: result.message,
      actionLabel: 'Open store',
      actionHref: `/stores/${connectionId}?tab=credentials`,
      correlationId,
      dedupeWindowMinutes: 30,
    });
  }

  return {
    ok: result.ok,
    message: result.message,
    latencyMs: result.latencyMs,
    grantedScopes: result.grantedScopes,
    missingScopes: result.missingScopes,
    isSimulated: result.isSimulated,
  };
}

/** Pulls store metadata (plan, currency, MSF status) into the connection row. */
export async function refreshStoreMetadata(
  connectionId: string,
  correlationId?: string,
): Promise<OperationOutcome> {
  const handle = await tryGetProviderFor(connectionId);
  if (!handle.ok) {
    return { ok: false, message: handle.error.message };
  }

  try {
    const info = await handle.handle.provider.getStoreInfo();
    const activeStorefronts = Number(info.features.activeStorefronts ?? 0) || null;

    await prisma.storeConnection.update({
      where: { id: connectionId },
      data: {
        currencyCode: info.currencyCode,
        primaryDomain: info.domain,
        controlPanelUrl: info.controlPanelUrl,
        platformPlan: info.planName,
        timezone: info.timezoneName ?? undefined,
        countryCode: info.countryCode ?? undefined,
        msfEnabled: info.multiStorefrontEnabled ?? false,
        storefrontLimit: info.storefrontLimit,
        storefrontsUsed: activeStorefronts,
        lastSuccessfulSyncAt: new Date(),
        lastErrorSummary: null,
        healthStatus: 'HEALTHY',
      },
    });

    return {
      ok: true,
      message: handle.handle.source === 'DEMO'
        ? 'Demo store metadata refreshed from seed data.'
        : `Refreshed metadata for “${info.name}”.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.storeConnection.update({
      where: { id: connectionId },
      data: { lastFailedSyncAt: new Date(), lastErrorSummary: message, healthStatus: 'WARNING' },
    });
    logger.warn('Store metadata refresh failed', { connectionId, correlationId });
    return { ok: false, message };
  }
}

/**
 * Probes and persists the capability matrix for one store. This is what turns
 * the static registry into a per-store, verified view.
 */
export async function verifyStoreCapabilities(connectionId: string): Promise<OperationOutcome> {
  const handle = await tryGetProviderFor(connectionId);
  if (!handle.ok) return { ok: false, message: handle.error.message };

  const connection = await prisma.storeConnection.findUniqueOrThrow({
    where: { id: connectionId },
    select: { organisationId: true },
  });

  try {
    const results = await handle.handle.provider.probeCapabilities();

    for (const result of results) {
      const definition = CAPABILITY_DEFINITIONS[result.key as CapabilityKey];
      if (!definition) continue;

      await prisma.storeCapability.upsert({
        where: { connectionId_capabilityKey: { connectionId, capabilityKey: result.key } },
        create: {
          organisationId: connection.organisationId,
          connectionId,
          capabilityKey: result.key,
          status: result.status,
          requiredScope: definition.requiredScope,
          channelApplicable: definition.channelApplicable,
          planDependency: definition.planDependency,
          unavailableReason: result.reason ?? definition.unavailableReason,
          requiresConfirmation: definition.requiresConfirmation,
          isReversible: definition.isReversible,
          verificationSource: result.source,
          lastVerifiedAt: result.verifiedAt,
        },
        update: {
          status: result.status,
          unavailableReason: result.reason ?? definition.unavailableReason,
          verificationSource: result.source,
          lastVerifiedAt: result.verifiedAt,
        },
      });
    }

    const missing = results.filter((result) => result.status === 'PERMISSION_MISSING');
    if (missing.length > 0) {
      const store = await prisma.storeConnection.findUniqueOrThrow({
        where: { id: connectionId },
        select: { name: true, organisationId: true, companyId: true },
      });
      await notify({
        organisationId: store.organisationId,
        companyId: store.companyId,
        connectionId,
        type: 'MISSING_PERMISSION',
        severity: 'WARNING',
        title: `${store.name} is missing ${missing.length} API scope(s)`,
        body: `${missing.length} capability(ies) are unavailable because the API account lacks the required scope. Affected: ${missing
          .slice(0, 3)
          .map((entry) => CAPABILITY_DEFINITIONS[entry.key as CapabilityKey]?.label ?? entry.key)
          .join(', ')}${missing.length > 3 ? '…' : ''}.`,
        actionLabel: 'Review capabilities',
        actionHref: `/stores/${connectionId}?tab=capabilities`,
        dedupeWindowMinutes: 720,
      });
    }

    return { ok: true, message: `Verified ${results.length} capability(ies).` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

/** Disconnects a store: revokes credentials and marks it disconnected. */
export async function disconnectStore(connectionId: string): Promise<OperationOutcome> {
  const revoked = await revokeCredentials(connectionId);
  await prisma.storeConnection.update({
    where: { id: connectionId },
    data: {
      status: 'DISCONNECTED',
      healthStatus: 'UNKNOWN',
      healthMessage: 'Disconnected by an administrator. Stored credentials were revoked.',
    },
  });
  return {
    ok: true,
    message: `Store disconnected. ${revoked} stored credential(s) revoked. Snapshots and history are retained.`,
  };
}

/** Snapshot of the health of every store in a scope, for dashboards. */
export interface HealthSummary {
  total: number;
  healthy: number;
  warning: number;
  critical: number;
  unknown: number;
  credentialIssues: number;
  staleStores: number;
  planned: number;
}

const STALE_AFTER_HOURS = 48;

export async function summariseHealth(where: Record<string, unknown>): Promise<HealthSummary> {
  const connections = await prisma.storeConnection.findMany({
    where: { ...where, deletedAt: null },
    select: {
      healthStatus: true,
      status: true,
      lastSuccessfulSyncAt: true,
      lastErrorSummary: true,
    },
  });

  const staleThreshold = new Date(Date.now() - STALE_AFTER_HOURS * 3_600_000);

  return {
    total: connections.length,
    healthy: connections.filter((connection) => connection.healthStatus === 'HEALTHY').length,
    warning: connections.filter((connection) => connection.healthStatus === 'WARNING').length,
    critical: connections.filter((connection) => connection.healthStatus === 'CRITICAL').length,
    unknown: connections.filter((connection) => connection.healthStatus === 'UNKNOWN').length,
    credentialIssues: connections.filter(
      (connection) =>
        connection.healthStatus === 'CRITICAL' ||
        (connection.lastErrorSummary ?? '').toLowerCase().includes('token'),
    ).length,
    staleStores: connections.filter(
      (connection) =>
        connection.status === 'ACTIVE' &&
        (!connection.lastSuccessfulSyncAt || connection.lastSuccessfulSyncAt < staleThreshold),
    ).length,
    planned: connections.filter((connection) => connection.status === 'PLANNED').length,
  };
}

/** Records that a store setting cannot be automated, as an actionable item. */
export async function raiseManualAction(input: {
  organisationId: string;
  connectionId?: string | null;
  deploymentId?: string | null;
  category: string;
  title: string;
  description: string;
  reason: string;
  currentValue?: string | null;
  desiredValue?: string | null;
  docsUrl?: string | null;
}): Promise<string> {
  const item = await prisma.manualActionItem.create({
    data: {
      organisationId: input.organisationId,
      connectionId: input.connectionId ?? null,
      deploymentId: input.deploymentId ?? null,
      category: input.category,
      title: input.title,
      description: input.description,
      reason: input.reason,
      currentValue: input.currentValue ?? null,
      desiredValue: input.desiredValue ?? null,
      docsUrl: input.docsUrl ?? null,
    },
  });

  await notify({
    organisationId: input.organisationId,
    connectionId: input.connectionId,
    type: 'MANUAL_ACTION_REQUIRED',
    severity: 'INFO',
    title: 'Manual action required',
    body: `${input.title} — ${input.reason}`,
    actionLabel: 'View checklist',
    actionHref: input.connectionId ? `/stores/${input.connectionId}?tab=configuration` : '/settings',
    dedupeWindowMinutes: 60,
  });

  return item.id;
}

/** Serialises a store's cached headline metrics. */
export function storeMetrics(metricsJson: string): {
  revenue: string;
  currencyCode: string;
  orders: number;
  aov: string;
  conversionRate: number | null;
  refundRate: number | null;
} {
  try {
    const parsed = JSON.parse(metricsJson) as Record<string, unknown>;
    return {
      revenue: String(parsed.revenue ?? '0.00'),
      currencyCode: String(parsed.currencyCode ?? 'USD'),
      orders: Number(parsed.orders ?? 0),
      aov: String(parsed.aov ?? '0.00'),
      conversionRate: parsed.conversionRate === null || parsed.conversionRate === undefined ? null : Number(parsed.conversionRate),
      refundRate: parsed.refundRate === null || parsed.refundRate === undefined ? null : Number(parsed.refundRate),
    };
  } catch {
    return { revenue: '0.00', currencyCode: 'USD', orders: 0, aov: '0.00', conversionRate: null, refundRate: null };
  }
}

export function serialiseMetrics(metrics: Record<string, unknown>): string {
  return stringifyJson(metrics);
}
