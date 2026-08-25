/**
 * Local authentication adapter.
 *
 * There is no password, no registration and no identity provider: signing in
 * selects the seeded company administrator and mints a server-side session.
 * This is a development convenience and is explicitly not production-ready —
 * the app shell shows a persistent warning while it is active.
 *
 * What it does do properly, so the replacement is a drop-in:
 *  * the cookie carries a 32-byte random token, never user data;
 *  * only the SHA-256 hash of the token is stored;
 *  * sessions expire, can be revoked, and record a hashed IP and user agent;
 *  * authorization always re-reads the database rather than trusting a cookie.
 */
import { prisma } from '@/lib/db';
import { env } from '@/lib/config';
import { randomToken, sha256 } from '@/lib/crypto/hash';
import { logger } from '@/lib/logger';
import type { UserRole } from '@/lib/enums';
import { parseJson } from '@/lib/json';
import { z } from 'zod';
import type { ActiveScope, AuthAdapter, AuthContext, SignInResult } from './types';

const companyScopeSchema = z.array(z.string());

export class LocalAuthAdapter implements AuthAdapter {
  readonly id = 'local';
  readonly displayName = 'Local development sign-in';
  readonly isProductionReady = false;

  async signIn(input: { email?: string; userAgent?: string; ipHash?: string }): Promise<SignInResult> {
    const user = input.email
      ? await prisma.user.findFirst({ where: { email: input.email, isActive: true, deletedAt: null } })
      : await prisma.user.findFirst({
          where: { isActive: true, deletedAt: null, role: 'COMPANY_ADMIN' },
          orderBy: { createdAt: 'asc' },
        });

    if (!user) {
      return {
        ok: false,
        error:
          'No local administrator exists yet. Run `npm run db:seed` to create the demo organisation.',
      };
    }

    const membership = await prisma.organisationMembership.findFirst({
      where: { userId: user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    if (!membership) {
      return { ok: false, error: 'This user is not a member of any organisation.' };
    }

    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + env().SESSION_TTL_HOURS * 3_600_000);

    await prisma.session.create({
      data: {
        tokenHash: sha256(token),
        userId: user.id,
        organisationId: membership.organisationId,
        userAgent: input.userAgent?.slice(0, 250) ?? null,
        ipHash: input.ipHash ?? null,
        expiresAt,
      },
    });

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    logger.info('Local sign-in succeeded', { userId: user.id, organisationId: membership.organisationId });
    return { ok: true, token, expiresAt };
  }

  async resolveSession(token: string): Promise<AuthContext | null> {
    if (!token) return null;

    const session = await prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: {
        user: true,
        organisation: { select: { id: true, name: true } },
      },
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
    if (!session.user.isActive || session.user.deletedAt) return null;

    const membership = await prisma.organisationMembership.findUnique({
      where: { organisationId_userId: { organisationId: session.organisationId, userId: session.userId } },
    });
    if (!membership) return null;

    // Touch lastSeenAt at most once a minute to avoid a write on every request.
    if (Date.now() - session.lastSeenAt.getTime() > 60_000) {
      await prisma.session
        .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
        .catch(() => undefined);
    }

    const scope: ActiveScope = {
      organisationId: session.organisationId,
      organisationName: session.organisation.name,
      companyId: session.activeCompanyId,
      storeId: session.activeStoreId,
      channelId: session.activeChannelId,
    };

    return {
      sessionId: session.id,
      expiresAt: session.expiresAt,
      companyScope: parseJson(membership.companyScopeJson, companyScopeSchema, []),
      scope,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        jobTitle: session.user.jobTitle,
        role: membership.role as UserRole,
        avatarColor: session.user.avatarColor,
      },
    };
  }

  async signOut(token: string): Promise<void> {
    if (!token) return;
    await prisma.session
      .updateMany({ where: { tokenHash: sha256(token) }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
  }

  async updateScope(
    sessionId: string,
    scope: Partial<Omit<ActiveScope, 'organisationName'>>,
  ): Promise<void> {
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        ...(scope.organisationId !== undefined ? { organisationId: scope.organisationId } : {}),
        ...(scope.companyId !== undefined ? { activeCompanyId: scope.companyId } : {}),
        ...(scope.storeId !== undefined ? { activeStoreId: scope.storeId } : {}),
        ...(scope.channelId !== undefined ? { activeChannelId: scope.channelId } : {}),
      },
    });
  }
}

/** Removes expired sessions. Called opportunistically from the job runner. */
export async function pruneExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 24 * 3_600_000) } },
  });
  return result.count;
}
