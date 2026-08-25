/**
 * Tenant isolation.
 *
 * Every query that touches tenant data must be built from a `TenantScope`.
 * The helpers here are pure so they can be unit-tested without a database, and
 * the assertion helpers are the single choke point that stops a record from one
 * organisation being returned to another.
 */
import { AppError } from '@/lib/errors';
import type { AuthContext } from '@/lib/auth/types';

export interface TenantScope {
  organisationId: string;
  /** null = every company the membership can see. */
  companyId: string | null;
  storeId: string | null;
  channelId: string | null;
  /** Companies the membership is limited to. Empty = unrestricted within the org. */
  allowedCompanyIds: string[];
  userId: string;
  sessionId: string;
}

export function scopeFromAuth(auth: AuthContext): TenantScope {
  return {
    organisationId: auth.scope.organisationId,
    companyId: auth.scope.companyId,
    storeId: auth.scope.storeId,
    channelId: auth.scope.channelId,
    allowedCompanyIds: auth.companyScope,
    userId: auth.user.id,
    sessionId: auth.sessionId,
  };
}

/** Records that carry an organisation boundary. */
export interface TenantOwned {
  organisationId: string;
}

export interface CompanyOwned extends TenantOwned {
  companyId?: string | null;
}

/**
 * Guard for a single record. Throws `TENANT_MISMATCH` rather than `NOT_FOUND`
 * only in server logs; the public message is deliberately identical to a
 * missing record so it cannot be used to probe for other tenants' ids.
 */
export function assertTenantAccess<T extends TenantOwned>(
  record: T | null | undefined,
  scope: TenantScope,
  resourceLabel = 'record',
): T {
  if (!record || record.organisationId !== scope.organisationId) {
    throw new AppError('NOT_FOUND', `That ${resourceLabel} could not be found.`, {
      detail: record
        ? `Tenant mismatch: record org ${record.organisationId} vs scope org ${scope.organisationId}`
        : `No ${resourceLabel} matched within organisation ${scope.organisationId}`,
    });
  }
  return record;
}

/** Additionally enforces the membership's company restriction. */
export function assertCompanyAccess<T extends CompanyOwned>(
  record: T | null | undefined,
  scope: TenantScope,
  resourceLabel = 'record',
): T {
  const owned = assertTenantAccess(record, scope, resourceLabel);
  if (
    scope.allowedCompanyIds.length > 0 &&
    owned.companyId &&
    !scope.allowedCompanyIds.includes(owned.companyId)
  ) {
    throw new AppError('FORBIDDEN', `You do not have access to that ${resourceLabel}.`, {
      detail: `Company ${owned.companyId} not in membership scope`,
    });
  }
  return owned;
}

export function canAccessCompany(scope: TenantScope, companyId: string): boolean {
  return scope.allowedCompanyIds.length === 0 || scope.allowedCompanyIds.includes(companyId);
}

/**
 * The `where` fragment that every tenant query starts from. Combining the
 * organisation boundary with the membership's company restriction and the
 * user's active scope selection in one place means a page cannot forget one.
 */
export function tenantWhere(scope: TenantScope): {
  organisationId: string;
  companyId?: string | { in: string[] };
} {
  const where: { organisationId: string; companyId?: string | { in: string[] } } = {
    organisationId: scope.organisationId,
  };

  if (scope.companyId) {
    // The active selection must itself be inside the membership scope.
    if (!canAccessCompany(scope, scope.companyId)) {
      throw new AppError('FORBIDDEN', 'You do not have access to the selected company.');
    }
    where.companyId = scope.companyId;
  } else if (scope.allowedCompanyIds.length > 0) {
    where.companyId = { in: scope.allowedCompanyIds };
  }

  return where;
}

/** Same as `tenantWhere` but for models with a nullable company column. */
export function tenantWhereOptionalCompany(scope: TenantScope): Record<string, unknown> {
  const base: Record<string, unknown> = { organisationId: scope.organisationId };
  if (scope.companyId) {
    if (!canAccessCompany(scope, scope.companyId)) {
      throw new AppError('FORBIDDEN', 'You do not have access to the selected company.');
    }
    base.OR = [{ companyId: scope.companyId }, { companyId: null }];
  } else if (scope.allowedCompanyIds.length > 0) {
    base.OR = [{ companyId: { in: scope.allowedCompanyIds } }, { companyId: null }];
  }
  return base;
}

/** Where fragment for store-scoped models, honouring the active store selection. */
export function storeScopedWhere(scope: TenantScope): Record<string, unknown> {
  const where = tenantWhereOptionalCompany(scope);
  if (scope.storeId) {
    where.connectionId = scope.storeId;
  }
  if (scope.channelId) {
    where.channelId = scope.channelId;
  }
  return where;
}

/**
 * Filters a list of already-loaded records down to the tenant scope. Used where
 * a query cannot express the constraint (aggregations, in-memory joins).
 */
export function filterToTenant<T extends TenantOwned>(records: T[], scope: TenantScope): T[] {
  return records.filter((record) => record.organisationId === scope.organisationId);
}

// ---------------------------------------------------------------------------
// Role capabilities
//
// v1 only issues COMPANY_ADMIN, but the matrix is defined now so future roles
// slot in without touching call sites.
// ---------------------------------------------------------------------------

export type Permission =
  | 'store:read'
  | 'store:write'
  | 'credential:write'
  | 'catalog:read'
  | 'catalog:write'
  | 'pricing:write'
  | 'inventory:write'
  | 'content:write'
  | 'theme:deploy'
  | 'order:write'
  | 'customer:read'
  | 'deployment:create'
  | 'deployment:execute'
  | 'deployment:approve'
  | 'conflict:resolve'
  | 'settings:write'
  | 'audit:read';

const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  ORGANISATION_OWNER: [
    'store:read', 'store:write', 'credential:write', 'catalog:read', 'catalog:write',
    'pricing:write', 'inventory:write', 'content:write', 'theme:deploy', 'order:write',
    'customer:read', 'deployment:create', 'deployment:execute', 'deployment:approve',
    'conflict:resolve', 'settings:write', 'audit:read',
  ],
  COMPANY_ADMIN: [
    'store:read', 'store:write', 'credential:write', 'catalog:read', 'catalog:write',
    'pricing:write', 'inventory:write', 'content:write', 'theme:deploy', 'order:write',
    'customer:read', 'deployment:create', 'deployment:execute', 'conflict:resolve',
    'settings:write', 'audit:read',
  ],
  REGIONAL_MANAGER: [
    'store:read', 'catalog:read', 'catalog:write', 'pricing:write', 'inventory:write',
    'content:write', 'order:write', 'customer:read', 'deployment:create', 'conflict:resolve',
    'audit:read',
  ],
  STORE_MANAGER: [
    'store:read', 'catalog:read', 'catalog:write', 'inventory:write', 'content:write',
    'order:write', 'customer:read',
  ],
  ANALYST: ['store:read', 'catalog:read', 'customer:read', 'audit:read'],
  READ_ONLY: ['store:read', 'catalog:read'],
  INTEGRATION_ADMIN: ['store:read', 'store:write', 'credential:write', 'catalog:read', 'audit:read'],
};

export function roleHasPermission(role: string, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function requirePermission(auth: AuthContext, permission: Permission): void {
  if (!roleHasPermission(auth.user.role, permission)) {
    throw new AppError('FORBIDDEN', 'Your role does not allow that action.', {
      detail: `role=${auth.user.role} permission=${permission}`,
    });
  }
}
