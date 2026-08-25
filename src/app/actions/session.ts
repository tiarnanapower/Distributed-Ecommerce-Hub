'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import {
  SESSION_COOKIE,
  currentRequestIpHash,
  currentUserAgent,
  getAuthAdapter,
  requireAuth,
  sessionCookieOptions,
} from '@/lib/auth/session';
import { scopeFromAuth } from '@/lib/tenancy';
import { AUDIT_ACTIONS, recordAudit } from '@/server/services/audit';
import { prisma } from '@/lib/db';
import { markAllNotificationsRead, markNotificationRead } from '@/server/services/notifications';

/**
 * Local sign-in. There is no credential to validate — the adapter selects the
 * seeded administrator. Replacing the adapter is the only change needed to move
 * to a real identity provider.
 */
export async function signInLocally(): Promise<{ ok: boolean; error?: string }> {
  const adapter = getAuthAdapter();
  const result = await adapter.signIn({
    userAgent: (await currentUserAgent()) ?? undefined,
    ipHash: (await currentRequestIpHash()) ?? undefined,
  });

  if (!result.ok || !result.token) {
    return { ok: false, error: result.error ?? 'Sign-in failed.' };
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, result.token, sessionCookieOptions(result.expiresAt));

  const context = await adapter.resolveSession(result.token);
  if (context) {
    await recordAudit({
      scope: scopeFromAuth(context),
      action: AUDIT_ACTIONS.SIGN_IN,
      resourceType: 'session',
      resourceId: context.sessionId,
      resourceLabel: context.user.name,
      after: { method: adapter.id, organisationId: context.scope.organisationId },
      ipHash: await currentRequestIpHash(),
    });
  }

  return { ok: true };
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) {
    const adapter = getAuthAdapter();
    const context = await adapter.resolveSession(token);
    if (context) {
      await recordAudit({
        scope: scopeFromAuth(context),
        action: AUDIT_ACTIONS.SIGN_OUT,
        resourceType: 'session',
        resourceId: context.sessionId,
        resourceLabel: context.user.name,
      });
    }
    await adapter.signOut(token);
  }

  store.delete(SESSION_COOKIE);
  redirect('/login');
}

const scopeSchema = z.object({
  companyId: z.string().nullable().optional(),
  storeId: z.string().nullable().optional(),
  channelId: z.string().nullable().optional(),
});

/**
 * Persists the header's scope selection on the session. Selections are
 * validated against the tenant before being written, so a crafted request
 * cannot pin the session to another organisation's store.
 */
export async function setActiveScope(input: z.infer<typeof scopeSchema>): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAuth();
  const parsed = scopeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid scope selection.' };

  const { companyId, storeId, channelId } = parsed.data;

  if (companyId) {
    const company = await prisma.company.findFirst({
      where: { id: companyId, organisationId: auth.scope.organisationId, deletedAt: null },
      select: { id: true },
    });
    if (!company) return { ok: false, error: 'That company is not available in this organisation.' };
    if (auth.companyScope.length > 0 && !auth.companyScope.includes(companyId)) {
      return { ok: false, error: 'You do not have access to that company.' };
    }
  }

  if (storeId) {
    const store = await prisma.storeConnection.findFirst({
      where: { id: storeId, organisationId: auth.scope.organisationId, deletedAt: null },
      select: { id: true, companyId: true },
    });
    if (!store) return { ok: false, error: 'That store is not available in this organisation.' };
    if (auth.companyScope.length > 0 && !auth.companyScope.includes(store.companyId)) {
      return { ok: false, error: 'You do not have access to that store.' };
    }
  }

  if (channelId) {
    const channel = await prisma.storefrontChannel.findFirst({
      where: { id: channelId, organisationId: auth.scope.organisationId, deletedAt: null },
      select: { id: true },
    });
    if (!channel) return { ok: false, error: 'That storefront is not available in this organisation.' };
  }

  await getAuthAdapter().updateScope(auth.sessionId, {
    companyId: companyId ?? null,
    storeId: storeId ?? null,
    // Changing store clears the channel unless one was explicitly supplied.
    channelId: channelId ?? null,
  });

  await recordAudit({
    scope: scopeFromAuth(auth),
    action: AUDIT_ACTIONS.SCOPE_CHANGED,
    resourceType: 'session',
    resourceId: auth.sessionId,
    before: {
      companyId: auth.scope.companyId,
      storeId: auth.scope.storeId,
      channelId: auth.scope.channelId,
    },
    after: { companyId, storeId, channelId },
  });

  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function dismissNotification(id: string): Promise<void> {
  const auth = await requireAuth();
  await markNotificationRead(id, auth.scope.organisationId);
  revalidatePath('/', 'layout');
}

export async function dismissAllNotifications(): Promise<void> {
  const auth = await requireAuth();
  await markAllNotificationsRead(auth.scope.organisationId);
  revalidatePath('/', 'layout');
}
