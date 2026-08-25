import type { UserRole } from '@/lib/enums';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  jobTitle: string | null;
  role: UserRole;
  avatarColor: string;
}

export interface ActiveScope {
  organisationId: string;
  organisationName: string;
  /** null = "All companies". */
  companyId: string | null;
  /** null = "All stores". */
  storeId: string | null;
  /** null = the whole store rather than one channel. */
  channelId: string | null;
}

export interface AuthContext {
  user: AuthenticatedUser;
  sessionId: string;
  scope: ActiveScope;
  /** Companies this membership may see. Empty = every company in the org. */
  companyScope: string[];
  expiresAt: Date;
}

export interface SignInResult {
  ok: boolean;
  token?: string;
  expiresAt?: Date;
  error?: string;
}

/**
 * The seam that lets local authentication be replaced by Auth.js, Entra ID,
 * Okta, Google Workspace, SAML or OIDC without touching application code.
 *
 * An external provider implementation would map its own identity claims onto
 * `AuthenticatedUser` and reuse `createSession` / `destroySession` unchanged.
 */
export interface AuthAdapter {
  readonly id: string;
  readonly displayName: string;
  /** Whether the adapter is safe for shared or production deployments. */
  readonly isProductionReady: boolean;

  /** Establishes a session. Local adapter ignores credentials by design. */
  signIn(input: { email?: string; userAgent?: string; ipHash?: string }): Promise<SignInResult>;

  /** Resolves a raw cookie token to a full auth context, or null. */
  resolveSession(token: string): Promise<AuthContext | null>;

  /** Revokes a session. Idempotent. */
  signOut(token: string): Promise<void>;

  /** Persists the active organisation/company/store/channel selection. */
  updateScope(sessionId: string, scope: Partial<Omit<ActiveScope, 'organisationName'>>): Promise<void>;
}
