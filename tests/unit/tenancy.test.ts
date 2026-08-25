import { describe, expect, it } from 'vitest';

import { AppError } from '@/lib/errors';
import {
  assertCompanyAccess,
  assertTenantAccess,
  canAccessCompany,
  filterToTenant,
  requirePermission,
  roleHasPermission,
  scopeFromAuth,
  storeScopedWhere,
  tenantWhere,
  tenantWhereOptionalCompany,
  type TenantScope,
} from '@/lib/tenancy';
import type { AuthContext } from '@/lib/auth/types';

const scope = (overrides: Partial<TenantScope> = {}): TenantScope => ({
  organisationId: 'org-A',
  companyId: null,
  storeId: null,
  channelId: null,
  allowedCompanyIds: [],
  userId: 'user-1',
  sessionId: 'session-1',
  ...overrides,
});

describe('assertTenantAccess', () => {
  it('returns a record belonging to the tenant', () => {
    const record = { organisationId: 'org-A', id: 'x' };
    expect(assertTenantAccess(record, scope())).toBe(record);
  });

  it('rejects a record from another organisation', () => {
    expect(() => assertTenantAccess({ organisationId: 'org-B' }, scope())).toThrow(AppError);
  });

  it('rejects a missing record', () => {
    expect(() => assertTenantAccess(null, scope())).toThrow(AppError);
  });

  it('does not reveal that the record exists elsewhere', () => {
    // A cross-tenant hit and a genuine miss must be indistinguishable to the
    // caller, otherwise the API becomes an existence oracle for other tenants.
    let crossTenantMessage = '';
    let missingMessage = '';

    try {
      assertTenantAccess({ organisationId: 'org-B' }, scope(), 'store');
    } catch (error) {
      crossTenantMessage = (error as AppError).message;
    }
    try {
      assertTenantAccess(null, scope(), 'store');
    } catch (error) {
      missingMessage = (error as AppError).message;
    }

    expect(crossTenantMessage).toBe(missingMessage);
    expect(crossTenantMessage).toBe('That store could not be found.');
  });

  it('uses NOT_FOUND rather than FORBIDDEN for a cross-tenant record', () => {
    try {
      assertTenantAccess({ organisationId: 'org-B' }, scope());
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as AppError).code).toBe('NOT_FOUND');
      // The real reason is kept server-side for the log.
      expect((error as AppError).detail).toContain('Tenant mismatch');
    }
  });
});

describe('assertCompanyAccess', () => {
  it('allows a company inside the membership scope', () => {
    const record = { organisationId: 'org-A', companyId: 'company-1' };
    expect(assertCompanyAccess(record, scope({ allowedCompanyIds: ['company-1'] }))).toBe(record);
  });

  it('rejects a company outside the membership scope', () => {
    expect(() =>
      assertCompanyAccess(
        { organisationId: 'org-A', companyId: 'company-2' },
        scope({ allowedCompanyIds: ['company-1'] }),
      ),
    ).toThrow(AppError);
  });

  it('allows any company when the membership is unrestricted', () => {
    const record = { organisationId: 'org-A', companyId: 'company-9' };
    expect(assertCompanyAccess(record, scope())).toBe(record);
  });

  it('still enforces the organisation boundary first', () => {
    expect(() =>
      assertCompanyAccess(
        { organisationId: 'org-B', companyId: 'company-1' },
        scope({ allowedCompanyIds: ['company-1'] }),
      ),
    ).toThrow(AppError);
  });
});

describe('tenantWhere', () => {
  it('always constrains by organisation', () => {
    expect(tenantWhere(scope())).toEqual({ organisationId: 'org-A' });
  });

  it('applies the active company selection', () => {
    expect(tenantWhere(scope({ companyId: 'company-1' }))).toEqual({
      organisationId: 'org-A',
      companyId: 'company-1',
    });
  });

  it('constrains to the membership scope when no company is selected', () => {
    expect(tenantWhere(scope({ allowedCompanyIds: ['c1', 'c2'] }))).toEqual({
      organisationId: 'org-A',
      companyId: { in: ['c1', 'c2'] },
    });
  });

  it('refuses a selection outside the membership scope', () => {
    expect(() => tenantWhere(scope({ companyId: 'c9', allowedCompanyIds: ['c1'] }))).toThrow(AppError);
  });

  it('includes org-wide records when the company column is nullable', () => {
    const where = tenantWhereOptionalCompany(scope({ companyId: 'c1' }));
    expect(where.OR).toEqual([{ companyId: 'c1' }, { companyId: null }]);
  });
});

describe('storeScopedWhere', () => {
  it('narrows to the active store and channel', () => {
    const where = storeScopedWhere(scope({ storeId: 'store-1', channelId: 'channel-1' }));
    expect(where.connectionId).toBe('store-1');
    expect(where.channelId).toBe('channel-1');
    expect(where.organisationId).toBe('org-A');
  });

  it('omits the store filter when nothing is selected', () => {
    const where = storeScopedWhere(scope());
    expect(where.connectionId).toBeUndefined();
  });
});

describe('filterToTenant', () => {
  it('drops records from other organisations', () => {
    const records = [
      { organisationId: 'org-A', id: '1' },
      { organisationId: 'org-B', id: '2' },
      { organisationId: 'org-A', id: '3' },
    ];
    expect(filterToTenant(records, scope()).map((record) => record.id)).toEqual(['1', '3']);
  });
});

describe('canAccessCompany', () => {
  it('permits everything when unrestricted', () => {
    expect(canAccessCompany(scope(), 'anything')).toBe(true);
  });

  it('permits only listed companies when restricted', () => {
    const restricted = scope({ allowedCompanyIds: ['c1'] });
    expect(canAccessCompany(restricted, 'c1')).toBe(true);
    expect(canAccessCompany(restricted, 'c2')).toBe(false);
  });
});

describe('role permissions', () => {
  it('grants a company admin the write permissions it needs', () => {
    expect(roleHasPermission('COMPANY_ADMIN', 'deployment:create')).toBe(true);
    expect(roleHasPermission('COMPANY_ADMIN', 'credential:write')).toBe(true);
  });

  it('withholds approval from a company admin, so duties can be separated later', () => {
    expect(roleHasPermission('COMPANY_ADMIN', 'deployment:approve')).toBe(false);
    expect(roleHasPermission('ORGANISATION_OWNER', 'deployment:approve')).toBe(true);
  });

  it('keeps read-only users read-only', () => {
    expect(roleHasPermission('READ_ONLY', 'catalog:read')).toBe(true);
    expect(roleHasPermission('READ_ONLY', 'catalog:write')).toBe(false);
    expect(roleHasPermission('READ_ONLY', 'deployment:execute')).toBe(false);
  });

  it('denies an unknown role everything', () => {
    expect(roleHasPermission('NOT_A_ROLE', 'store:read')).toBe(false);
  });

  it('requirePermission throws FORBIDDEN for a role that lacks it', () => {
    const auth = {
      user: { id: 'u', email: 'e', name: 'n', jobTitle: null, role: 'ANALYST', avatarColor: '#000' },
    } as AuthContext;
    expect(() => requirePermission(auth, 'catalog:write')).toThrow(AppError);
    try {
      requirePermission(auth, 'catalog:write');
    } catch (error) {
      expect((error as AppError).code).toBe('FORBIDDEN');
    }
  });
});

describe('scopeFromAuth', () => {
  it('carries the active selection and membership restriction through', () => {
    const auth: AuthContext = {
      user: { id: 'u1', email: 'a@b.c', name: 'A', jobTitle: null, role: 'COMPANY_ADMIN', avatarColor: '#fff' },
      sessionId: 's1',
      companyScope: ['c1'],
      expiresAt: new Date(),
      scope: {
        organisationId: 'org-A',
        organisationName: 'Acme',
        companyId: 'c1',
        storeId: 'store-1',
        channelId: null,
      },
    };
    const result = scopeFromAuth(auth);
    expect(result).toEqual({
      organisationId: 'org-A',
      companyId: 'c1',
      storeId: 'store-1',
      channelId: null,
      allowedCompanyIds: ['c1'],
      userId: 'u1',
      sessionId: 's1',
    });
  });
});
