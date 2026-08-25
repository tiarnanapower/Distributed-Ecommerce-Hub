'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { prisma } from '@/lib/db';
import { toAppError } from '@/lib/errors';
import { currentRequestIpHash, requireAuth } from '@/lib/auth/session';
import { requirePermission, scopeFromAuth, tenantWhere } from '@/lib/tenancy';
import { JOB_TYPE_LABELS, type JobType } from '@/lib/enums';
import { AUDIT_ACTIONS, recordAudit } from '@/server/services/audit';
import { jobQueue } from '@/server/jobs/runner';
import { registerAllJobHandlers } from '@/server/jobs/handlers';
import { RUNNABLE_JOB_TYPES, type RunnableJobType } from '@/lib/sync-jobs';
import type { ActionResult } from './connections';

const runSyncSchema = z.object({
  jobTypes: z.array(z.enum(RUNNABLE_JOB_TYPES)).min(1, 'Choose at least one thing to sync.'),
  connectionIds: z.array(z.string()).min(1, 'Choose at least one store.'),
  /** How far back to pull orders. Ignored by the other job types. */
  sinceDays: z.number().int().min(1).max(730).default(90),
});

export type RunSyncInput = z.input<typeof runSyncSchema>;

/**
 * Enqueues one job per selected type against the selected stores.
 *
 * These are all read operations — they capture snapshots from BigCommerce into
 * this platform. Nothing is written back to any store, which is why this needs
 * no dry-run or confirmation step.
 */
export async function runSync(
  input: RunSyncInput,
): Promise<ActionResult<{ jobIds: string[]; queued: number }>> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'catalog:read');
    const scope = scopeFromAuth(auth);

    const parsed = runSyncSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? 'Invalid input.',
        fieldErrors: Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
        ),
      };
    }
    const values = parsed.data;

    // Every target must belong to this organisation and be visible to this
    // membership — the same guard every other query goes through.
    const stores = await prisma.storeConnection.findMany({
      where: { ...tenantWhere(scope), id: { in: values.connectionIds }, deletedAt: null },
      select: { id: true, name: true, companyId: true, status: true },
    });

    if (stores.length === 0) {
      return { ok: false, error: 'None of the selected stores are available in this organisation.' };
    }

    // A store with no hash has nothing to sync from yet.
    const syncable = stores.filter((store) => store.status !== 'PLANNED');
    if (syncable.length === 0) {
      return {
        ok: false,
        error: 'Every selected store is still in the planned state and has no BigCommerce store to read from.',
        hint: 'Finish the connection wizard for those stores first.',
      };
    }

    registerAllJobHandlers();

    // One job per type, each targeting every selected store. Keeping them
    // separate means a catalog failure does not hide a successful order pull.
    const jobIds: string[] = [];
    for (const jobType of values.jobTypes) {
      const { jobId } = await jobQueue.enqueue({
        organisationId: scope.organisationId,
        companyId: syncable[0]!.companyId,
        jobType: jobType as JobType,
        resourceCategory: resourceCategoryFor(jobType),
        initiatedByUserId: auth.user.id,
        parameters: { sinceDays: values.sinceDays },
        targets: syncable.map((store) => ({ connectionId: store.id })),
      });
      jobIds.push(jobId);
    }

    await recordAudit({
      scope,
      action: AUDIT_ACTIONS.JOB_ENQUEUED,
      resourceType: 'job',
      resourceId: jobIds[0] ?? null,
      resourceLabel: `${values.jobTypes.map((type) => JOB_TYPE_LABELS[type as JobType]).join(', ')} across ${syncable.length} store(s)`,
      companyId: syncable[0]!.companyId,
      after: {
        jobTypes: values.jobTypes,
        storeCount: syncable.length,
        skipped: stores.length - syncable.length,
        sinceDays: values.sinceDays,
      },
      ipHash: await currentRequestIpHash(),
    });

    revalidatePath('/sync');
    revalidatePath('/stores');
    return { ok: true, data: { jobIds, queued: jobIds.length } };
  } catch (error) {
    const appError = toAppError(error);
    return { ok: false, error: appError.message, hint: appError.hint };
  }
}

export async function cancelJob(jobId: string): Promise<ActionResult> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'catalog:read');
    const scope = scopeFromAuth(auth);

    const job = await prisma.syncJob.findFirst({
      where: { id: jobId, organisationId: scope.organisationId },
      select: { id: true, jobType: true, status: true },
    });
    if (!job) return { ok: false, error: 'That job could not be found.' };

    if (!['QUEUED', 'RUNNING', 'AWAITING_APPROVAL'].includes(job.status)) {
      return { ok: false, error: `A job in the ${job.status.toLowerCase()} state cannot be cancelled.` };
    }

    await jobQueue.cancel(jobId);

    await recordAudit({
      scope,
      action: AUDIT_ACTIONS.JOB_CANCELLED,
      resourceType: 'job',
      resourceId: jobId,
      resourceLabel: JOB_TYPE_LABELS[job.jobType as JobType] ?? job.jobType,
      before: { status: job.status },
      after: { status: 'CANCELLED' },
    });

    revalidatePath('/sync');
    revalidatePath(`/sync/${jobId}`);
    return { ok: true };
  } catch (error) {
    const appError = toAppError(error);
    return { ok: false, error: appError.message };
  }
}

function resourceCategoryFor(jobType: RunnableJobType): string | null {
  switch (jobType) {
    case 'CATALOG_PULL':
      return 'PRODUCTS';
    case 'CUSTOMER_PULL':
      return 'CUSTOMER_GROUPS';
    default:
      return null;
  }
}
