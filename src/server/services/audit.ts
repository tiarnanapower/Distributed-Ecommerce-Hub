/**
 * Audit logging.
 *
 * Every meaningful action records who did what, to which resource, in which
 * tenant, and how it turned out. Payloads pass through `redact` so a secret can
 * never be persisted into an audit row.
 */
import { prisma } from '@/lib/db';
import { redact, redactString } from '@/lib/crypto/credentials';
import { logger, newCorrelationId } from '@/lib/logger';
import { stringifyJson } from '@/lib/json';
import type { ActorType, AuditOutcome } from '@/lib/enums';
import type { TenantScope } from '@/lib/tenancy';

export interface AuditInput {
  scope: Pick<TenantScope, 'organisationId' | 'userId' | 'sessionId'>;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  resourceLabel?: string | null;
  companyId?: string | null;
  connectionId?: string | null;
  channelId?: string | null;
  before?: unknown;
  after?: unknown;
  outcome?: AuditOutcome;
  errorSummary?: string | null;
  actorType?: ActorType;
  actorLabel?: string | null;
  ipHash?: string | null;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

/** Compresses an object into a short human-readable summary for the audit row. */
export function summarise(value: unknown, maxLength = 500): string | null {
  if (value === null || value === undefined) return null;
  const safe = redact(value);
  if (typeof safe === 'string') return redactString(safe).slice(0, maxLength);
  if (typeof safe !== 'object') return String(safe).slice(0, maxLength);

  const entries = Object.entries(safe as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .map(([key, entry]) => {
      const rendered =
        entry === null
          ? 'null'
          : typeof entry === 'object'
            ? Array.isArray(entry)
              ? `[${entry.length} items]`
              : '{…}'
            : String(entry);
      return `${key}=${rendered}`;
    });
  return entries.join(', ').slice(0, maxLength) || null;
}

export async function recordAudit(input: AuditInput): Promise<string> {
  const correlationId = input.correlationId ?? newCorrelationId('audit');
  try {
    const event = await prisma.auditEvent.create({
      data: {
        organisationId: input.scope.organisationId,
        companyId: input.companyId ?? null,
        connectionId: input.connectionId ?? null,
        channelId: input.channelId ?? null,
        actorUserId: input.actorType && input.actorType !== 'USER' ? null : input.scope.userId,
        actorType: input.actorType ?? 'USER',
        actorLabel: input.actorLabel ?? null,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        resourceLabel: input.resourceLabel ?? null,
        beforeSummary: summarise(input.before),
        afterSummary: summarise(input.after),
        outcome: input.outcome ?? 'SUCCESS',
        errorSummary: input.errorSummary ? redactString(input.errorSummary).slice(0, 500) : null,
        ipHash: input.ipHash ?? null,
        sessionId: input.scope.sessionId,
        correlationId,
        metadataJson: stringifyJson(redact(input.metadata ?? {})),
      },
    });
    return event.id;
  } catch (error) {
    // Audit must never take down the action it is recording, but a failure to
    // record is itself notable.
    logger.error('Failed to write audit event', {
      action: input.action,
      resourceType: input.resourceType,
      correlationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return correlationId;
  }
}

/** Convenience wrapper: runs an action and audits both outcomes. */
export async function withAudit<T>(
  input: Omit<AuditInput, 'outcome' | 'errorSummary' | 'after'>,
  action: () => Promise<T>,
  describeResult?: (result: T) => unknown,
): Promise<T> {
  try {
    const result = await action();
    await recordAudit({
      ...input,
      outcome: 'SUCCESS',
      after: describeResult ? describeResult(result) : undefined,
    });
    return result;
  } catch (error) {
    await recordAudit({
      ...input,
      outcome: 'FAILURE',
      errorSummary: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export const AUDIT_ACTIONS = {
  SIGN_IN: 'auth.sign_in',
  SIGN_OUT: 'auth.sign_out',
  SCOPE_CHANGED: 'auth.scope_changed',
  CONNECTION_CREATED: 'connection.created',
  CONNECTION_UPDATED: 'connection.updated',
  CONNECTION_TESTED: 'connection.tested',
  CONNECTION_DISCONNECTED: 'connection.disconnected',
  CREDENTIAL_STORED: 'credential.stored',
  CREDENTIAL_ROTATED: 'credential.rotated',
  CREDENTIAL_REVOKED: 'credential.revoked',
  CAPABILITIES_VERIFIED: 'capability.verified',
  CHANNELS_DISCOVERED: 'channel.discovered',
  TEMPLATE_CREATED: 'template.created',
  TEMPLATE_UPDATED: 'template.updated',
  POLICY_UPDATED: 'inheritance.policy_updated',
  OVERRIDE_SET: 'override.set',
  OVERRIDE_REVERTED: 'override.reverted',
  COMPARISON_RUN: 'comparison.run',
  CONFLICT_RESOLVED: 'conflict.resolved',
  DEPLOYMENT_CREATED: 'deployment.created',
  DEPLOYMENT_DRY_RUN: 'deployment.dry_run',
  DEPLOYMENT_EXECUTED: 'deployment.executed',
  DEPLOYMENT_CANCELLED: 'deployment.cancelled',
  APPROVAL_REQUESTED: 'approval.requested',
  APPROVAL_DECIDED: 'approval.decided',
  JOB_ENQUEUED: 'job.enqueued',
  JOB_COMPLETED: 'job.completed',
  JOB_CANCELLED: 'job.cancelled',
  THEME_RELEASE_CREATED: 'theme.release_created',
  THEME_DEPLOYED: 'theme.deployed',
  CUSTOMER_GROUP_TEMPLATE_SAVED: 'customer_group.template_saved',
  CUSTOMER_GROUP_COPIED: 'customer_group.copied',
  ORDER_VIEWED: 'order.viewed',
  ORDER_ACTION_BLOCKED: 'order.action_blocked',
  CUSTOMER_EXPORTED: 'customer.exported',
  MANUAL_ACTION_COMPLETED: 'manual_action.completed',
  PROVISIONING_PLAN_CREATED: 'provisioning.plan_created',
  PROVISIONING_STEP_UPDATED: 'provisioning.step_updated',
  SETTINGS_UPDATED: 'settings.updated',
  FEATURE_FLAG_TOGGLED: 'settings.feature_flag_toggled',
  EXPORT_GENERATED: 'export.generated',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
