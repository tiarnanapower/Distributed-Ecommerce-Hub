// Server-only module. Importing `next/headers` makes this a build error inside
// any client component, which is the guard we rely on instead of a dependency.
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { env, runtime } from '@/lib/config';
import { keyedHash } from '@/lib/crypto/hash';
import { AppError } from '@/lib/errors';
import { LocalAuthAdapter } from './local-adapter';
import type { AuthAdapter, AuthContext } from './types';

export const SESSION_COOKIE = 'ccc_session';

/**
 * Adapter selection. Swapping in Auth.js, Entra ID or Okta means returning a
 * different implementation here; nothing else in the app changes.
 */
let adapter: AuthAdapter = new LocalAuthAdapter();

export function getAuthAdapter(): AuthAdapter {
  return adapter;
}

export function setAuthAdapter(next: AuthAdapter): void {
  adapter = next;
}

export function sessionCookieOptions(expiresAt?: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: runtime.isProduction(),
    path: '/',
    ...(expiresAt ? { expires: expiresAt } : {}),
  };
}

/**
 * Resolves the current request's auth context. Memoised per request via
 * React `cache`, so a page that guards in three places still hits the database
 * once.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return adapter.resolveSession(token);
});

/** Throws rather than redirecting — for route handlers and server actions. */
export async function requireAuth(): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) {
    throw new AppError('UNAUTHENTICATED', 'You need to sign in to perform this action.');
  }
  return context;
}

/** Redirects to the login page — for pages and layouts. */
export async function requireAuthOrRedirect(returnTo?: string): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) {
    const target = returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : '/login';
    redirect(target);
  }
  return context;
}

export async function currentRequestIpHash(): Promise<string | null> {
  const list = await headers();
  const forwarded = list.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || list.get('x-real-ip');
  return ip ? keyedHash(ip, 'ip') : null;
}

export async function currentUserAgent(): Promise<string | null> {
  const list = await headers();
  return list.get('user-agent');
}

export function sessionTtlHours(): number {
  return env().SESSION_TTL_HOURS;
}
