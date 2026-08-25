'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { prisma } from '@/lib/db';
import { toAppError } from '@/lib/errors';
import { currentRequestIpHash, requireAuth } from '@/lib/auth/session';
import { assertTenantAccess, requirePermission, scopeFromAuth } from '@/lib/tenancy';
import { RESOLUTION_ACTIONS, type ResolutionAction } from '@/lib/enums';
import { AUDIT_ACTIONS, recordAudit } from '@/server/services/audit';
import { jobQueue } from '@/server/jobs/runner';
import { registerAllJobHandlers } from '@/server/jobs/handlers';
import type { ActionResult } from './connections';

const resolveSchema = z.object({
  conflictId: z.string().min(1),
  action: z.enum(RESOLUTION_ACTIONS),
  note: z.string().max(1000).optional(),
});

/**
 * Records a resolution decision.
 *
 * Only the decisions that are safe today actually change anything:
 *  * KEEP_LOCAL, ACCEPT_VARIANCE, EXCLUDE and MANUAL_REVIEW are bookkeeping —
 *    they change how the conflict is reported and nothing else.
 *  * RE_ENABLE_INHERITANCE clears the local override so the next comparison
 *    treats the store as inheriting again.
 *  * KEEP_MASTER and COPY_MASTER_ONCE would write to the target store, which is
 *    not enabled. They are recorded and queued as a dry-run deployment plan
 *    rather than silently doing nothing.
 */
export async function resolveConflict(input: z.infer<typeof resolveSchema>): Promise<ActionResult> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'conflict:resolve');
    const scope = scopeFromAuth(auth);

    const parsed = resolveSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
    }

    const conflict = await prisma.conflict.findUnique({
      where: { id: parsed.data.conflictId },
      include: {
        target: { select: { id: true, name: true, companyId: true } },
        source: { select: { id: true, name: true } },
      },
    });
    assertTenantAccess(conflict, scope, 'conflict');

    const action = parsed.data.action as ResolutionAction;
    let nextStatus: string;
    let outcome: 'APPLIED' | 'QUEUED' | 'RECORDED' = 'RECORDED';
    let message: string;
    let appliedJobId: string | null = null;

    switch (action) {
      case 'ACCEPT_VARIANCE':
        nextStatus = 'ACCEPTED_VARIANCE';
        message =
          'Recorded as an accepted variance. Future comparison scans will keep seeing it but will not reopen it.';
        break;

      case 'EXCLUDE_FROM_COMPARISON':
        nextStatus = 'EXCLUDED';
        message = 'Excluded from future comparison. It will no longer appear in scan results.';
        break;

      case 'KEEP_LOCAL':
        nextStatus = 'RESOLVED';
        message = 'The local value stands. Nothing was written to the store.';
        break;

      case 'MANUAL_REVIEW':
        nextStatus = 'MANUAL_REVIEW';
        message = 'Flagged for manual review. It stays in the queue with a review marker.';
        break;

      case 'RE_ENABLE_INHERITANCE': {
        // This one genuinely changes platform state: the override is retired.
        const reverted = await prisma.resourceOverride.updateMany({
          where: {
            connectionId: conflict!.targetConnectionId,
            resourceCategory: conflict!.resourceCategory,
            resourceKey: conflict!.resourceKey,
            status: 'ACTIVE',
          },
          data: { status: 'REVERTED' },
        });
        nextStatus = 'RESOLVED';
        outcome = 'APPLIED';
        message =
          reverted.count > 0
            ? `Inheritance re-enabled: ${reverted.count} local override retired. The next deployment will bring this store back in line with its source.`
            : 'Inheritance re-enabled. No active override existed to retire.';
        break;
      }

      case 'KEEP_MASTER':
      case 'COPY_MASTER_ONCE': {
        // Writing to the store is not enabled, so this becomes a queued
        // comparison rather than a pretend success.
        registerAllJobHandlers();
        const job = await jobQueue.enqueue({
          organisationId: scope.organisationId,
          companyId: conflict!.target.companyId,
          jobType: 'COMPARISON_SCAN',
          resourceCategory: conflict!.resourceCategory,
          initiatedByUserId: auth.user.id,
          isDryRun: true,
          sourceConnectionId: conflict!.sourceConnectionId,
          parameters: {
            sourceConnectionId: conflict!.sourceConnectionId,
            categories: [conflict!.resourceCategory],
          },
          targets: [{ connectionId: conflict!.targetConnectionId }],
        });
        appliedJobId = job.jobId;
        nextStatus = 'ACKNOWLEDGED';
        outcome = 'QUEUED';
        message =
          'Recorded. Writing the master value to the store is not enabled in this release, so a dry-run comparison has been queued instead — it will show exactly what the write would change.';
        break;
      }

      default:
        nextStatus = 'ACKNOWLEDGED';
        message = 'Decision recorded.';
    }

    await prisma.$transaction([
      prisma.conflict.update({
        where: { id: conflict!.id },
        data: {
          status: nextStatus,
          resolvedAt: ['RESOLVED', 'ACCEPTED_VARIANCE', 'EXCLUDED'].includes(nextStatus) ? new Date() : null,
        },
      }),
      prisma.conflictResolution.create({
        data: {
          conflictId: conflict!.id,
          action,
          resolvedByUserId: auth.user.id,
          note: parsed.data.note || null,
          appliedJobId,
          outcome,
        },
      }),
    ]);

    await recordAudit({
      scope,
      action: AUDIT_ACTIONS.CONFLICT_RESOLVED,
      resourceType: 'conflict',
      resourceId: conflict!.id,
      resourceLabel: `${conflict!.target.name} — ${conflict!.resourceLabel ?? conflict!.resourceKey}`,
      connectionId: conflict!.targetConnectionId,
      companyId: conflict!.target.companyId,
      before: { status: conflict!.status },
      after: { status: nextStatus, action, outcome },
      ipHash: await currentRequestIpHash(),
    });

    revalidatePath('/conflicts');
    revalidatePath(`/conflicts/${conflict!.id}`);
    return { ok: true, hint: message };
  } catch (error) {
    const appError = toAppError(error);
    return { ok: false, error: appError.message, hint: appError.hint };
  }
}

const scanSchema = z.object({
  sourceConnectionId: z.string().min(1, 'Choose a source store.'),
  targetConnectionIds: z.array(z.string()).min(1, 'Choose at least one target store.'),
  categories: z.array(z.string()).min(1, 'Choose at least one resource category.'),
});

export async function runComparison(input: z.infer<typeof scanSchema>): Promise<ActionResult<{ jobId: string }>> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'catalog:read');
    const scope = scopeFromAuth(auth);

    const parsed = scanSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
    }

    // Every store id must belong to this organisation.
    const stores = await prisma.storeConnection.findMany({
      where: {
        id: { in: [parsed.data.sourceConnectionId, ...parsed.data.targetConnectionIds] },
        organisationId: scope.organisationId,
        deletedAt: null,
      },
      select: { id: true, companyId: true },
    });

    if (stores.length !== parsed.data.targetConnectionIds.length + 1) {
      return { ok: false, error: 'One or more selected stores are not available in this organisation.' };
    }

    registerAllJobHandlers();
    const { jobId } = await jobQueue.enqueue({
      organisationId: scope.organisationId,
      jobType: 'COMPARISON_SCAN',
      resourceCategory: parsed.data.categories[0],
      initiatedByUserId: auth.user.id,
      sourceConnectionId: parsed.data.sourceConnectionId,
      parameters: {
        sourceConnectionId: parsed.data.sourceConnectionId,
        categories: parsed.data.categories,
      },
      targets: parsed.data.targetConnectionIds.map((connectionId) => ({ connectionId })),
    });

    await recordAudit({
      scope,
      action: AUDIT_ACTIONS.COMPARISON_RUN,
      resourceType: 'comparison',
      resourceId: jobId,
      resourceLabel: `${parsed.data.categories.join(', ')} across ${parsed.data.targetConnectionIds.length} store(s)`,
      after: {
        source: parsed.data.sourceConnectionId,
        targets: parsed.data.targetConnectionIds.length,
        categories: parsed.data.categories,
      },
    });

    revalidatePath('/conflicts');
    revalidatePath('/sync');
    return { ok: true, data: { jobId } };
  } catch (error) {
    const appError = toAppError(error);
    return { ok: false, error: appError.message };
  }
}
