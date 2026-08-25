'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { prisma } from '@/lib/db';
import { toAppError } from '@/lib/errors';
import { currentRequestIpHash, requireAuth } from '@/lib/auth/session';
import { requirePermission, scopeFromAuth } from '@/lib/tenancy';
import { AUDIT_ACTIONS, recordAudit } from '@/server/services/audit';
import type { ActionResult } from './connections';

const flagSchema = z.object({ key: z.string().min(1), isEnabled: z.boolean() });

export async function toggleFeatureFlag(input: z.infer<typeof flagSchema>): Promise<ActionResult> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'settings:write');
    const scope = scopeFromAuth(auth);

    const parsed = flagSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Invalid input.' };

    const flag = await prisma.featureFlag.findUnique({
      where: { organisationId_key: { organisationId: scope.organisationId, key: parsed.data.key } },
    });
    if (!flag) return { ok: false, error: 'That feature flag does not exist.' };

    await prisma.featureFlag.update({
      where: { id: flag.id },
      data: { isEnabled: parsed.data.isEnabled },
    });

    await recordAudit({
      scope,
      action: AUDIT_ACTIONS.FEATURE_FLAG_TOGGLED,
      resourceType: 'feature_flag',
      resourceId: flag.id,
      resourceLabel: flag.name,
      before: { isEnabled: flag.isEnabled },
      after: { isEnabled: parsed.data.isEnabled },
      ipHash: await currentRequestIpHash(),
    });

    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (error) {
    const appError = toAppError(error);
    return { ok: false, error: appError.message };
  }
}

const manualActionSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'NOT_APPLICABLE']),
});

export async function updateManualAction(
  input: z.infer<typeof manualActionSchema>,
): Promise<ActionResult> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'settings:write');
    const scope = scopeFromAuth(auth);

    const parsed = manualActionSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Invalid input.' };

    const item = await prisma.manualActionItem.findFirst({
      where: { id: parsed.data.id, organisationId: scope.organisationId },
    });
    if (!item) return { ok: false, error: 'That checklist item could not be found.' };

    await prisma.manualActionItem.update({
      where: { id: item.id },
      data: {
        status: parsed.data.status,
        completedAt: parsed.data.status === 'COMPLETED' ? new Date() : null,
        completedByUserId: parsed.data.status === 'COMPLETED' ? auth.user.id : null,
      },
    });

    await recordAudit({
      scope,
      action: AUDIT_ACTIONS.MANUAL_ACTION_COMPLETED,
      resourceType: 'manual_action',
      resourceId: item.id,
      resourceLabel: item.title,
      connectionId: item.connectionId,
      before: { status: item.status },
      after: { status: parsed.data.status },
      ipHash: await currentRequestIpHash(),
    });

    revalidatePath('/settings/manual-actions');
    return { ok: true };
  } catch (error) {
    const appError = toAppError(error);
    return { ok: false, error: appError.message };
  }
}
