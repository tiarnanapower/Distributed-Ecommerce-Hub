import { describe, expect, it } from 'vitest';

import {
  DEFAULT_INHERITANCE_MODE,
  LAYER_RANK,
  effectiveMode,
  modeAllowsWrite,
  modeProtectsOverrides,
  modeRequiresApproval,
  resolveEffectiveValue,
  selectPolicy,
  type LayerValue,
  type PolicyRecord,
  type StoreScopeIds,
} from '@/lib/inheritance/resolver';

const layer = <T>(
  layerName: LayerValue<T>['layer'],
  value: T,
  sourceLabel: string,
  updatedAt?: Date,
): LayerValue<T> => ({ layer: layerName, value, sourceLabel, sourceId: sourceLabel, updatedAt });

const MASTER = layer('MASTER_STORE', 'master-value', 'UK Master Store');
const LOCAL = layer('LOCAL_OVERRIDE', 'local-value', 'Acme Germany');
const ORG = layer('ORGANISATION_TEMPLATE', 'org-value', 'Organisation default');

describe('layer precedence', () => {
  it('ranks layers from least to most specific', () => {
    expect(LAYER_RANK.GLOBAL_DEFAULT).toBeLessThan(LAYER_RANK.ORGANISATION_TEMPLATE);
    expect(LAYER_RANK.ORGANISATION_TEMPLATE).toBeLessThan(LAYER_RANK.COMPANY_TEMPLATE);
    expect(LAYER_RANK.COMPANY_TEMPLATE).toBeLessThan(LAYER_RANK.MASTER_STORE);
    expect(LAYER_RANK.MASTER_STORE).toBeLessThan(LAYER_RANK.REGIONAL);
    expect(LAYER_RANK.REGIONAL).toBeLessThan(LAYER_RANK.LOCAL_OVERRIDE);
  });

  it('prefers the most specific inherited layer when several are present', () => {
    const result = resolveEffectiveValue({
      resourceCategory: 'PRODUCTS',
      mode: 'INHERIT_WITH_OVERRIDES',
      layers: [ORG, MASTER],
    });
    expect(result.value).toBe('master-value');
    expect(result.origin).toBe('MASTER_STORE');
    expect(result.provenance).toContain('UK Master Store');
  });
});

describe('INHERIT_WITH_OVERRIDES', () => {
  it('lets a local override win', () => {
    const result = resolveEffectiveValue({
      resourceCategory: 'PRODUCTS',
      mode: 'INHERIT_WITH_OVERRIDES',
      layers: [MASTER, LOCAL],
    });
    expect(result.value).toBe('local-value');
    expect(result.origin).toBe('LOCAL_OVERRIDE');
    expect(result.isOverridden).toBe(true);
    expect(result.provenance).toBe('Overridden locally');
  });

  it('falls back to the master when there is no override', () => {
    const result = resolveEffectiveValue({
      resourceCategory: 'PRODUCTS',
      mode: 'INHERIT_WITH_OVERRIDES',
      layers: [MASTER],
    });
    expect(result.value).toBe('master-value');
    expect(result.isOverridden).toBe(false);
  });
});

describe('INHERIT_CONTINUOUS', () => {
  it('suppresses a local override rather than deleting it', () => {
    const result = resolveEffectiveValue({
      resourceCategory: 'CATEGORIES',
      mode: 'INHERIT_CONTINUOUS',
      layers: [MASTER, LOCAL],
    });
    expect(result.value).toBe('master-value');
    expect(result.isOverridden).toBe(false);
    expect(result.isOverrideSuppressed).toBe(true);
    expect(result.provenance).toContain('suppressed');
    // The override is still visible in the candidate list.
    expect(result.candidates.some((candidate) => candidate.layer === 'LOCAL_OVERRIDE')).toBe(true);
  });
});

describe('DO_NOT_INHERIT', () => {
  it('ignores inherited values entirely', () => {
    const result = resolveEffectiveValue({
      resourceCategory: 'PRICING',
      mode: 'DO_NOT_INHERIT',
      layers: [MASTER, LOCAL],
    });
    expect(result.value).toBe('local-value');
    expect(result.provenance).toContain('does not inherit');
  });

  it('reports NOT_SET when the store has no local value', () => {
    const result = resolveEffectiveValue({
      resourceCategory: 'PRICING',
      mode: 'DO_NOT_INHERIT',
      layers: [MASTER],
    });
    expect(result.value).toBeNull();
    expect(result.origin).toBe('NOT_SET');
    // The inherited layer must not leak into the candidate list here.
    expect(result.candidates).toHaveLength(0);
  });
});

describe('COPY_ONCE', () => {
  it('hands ownership to the store once a value exists', () => {
    const result = resolveEffectiveValue({
      resourceCategory: 'PRICE_LISTS',
      mode: 'COPY_ONCE',
      layers: [MASTER, LOCAL],
    });
    expect(result.value).toBe('local-value');
    expect(result.provenance).toContain('Copied once');
    // A later source change is not staleness under this mode.
    expect(result.isSourceStale).toBe(false);
  });
});

describe('source-changed-after-override detection', () => {
  const overrideSetAt = new Date('2026-01-01');
  const masterChangedLater = layer('MASTER_STORE', 'new-master', 'UK Master', new Date('2026-02-01'));

  it('flags a stale override', () => {
    const result = resolveEffectiveValue({
      resourceCategory: 'PRODUCTS',
      mode: 'INHERIT_WITH_OVERRIDES',
      layers: [masterChangedLater, LOCAL],
      overrideSetAt,
    });
    expect(result.isSourceStale).toBe(true);
    expect(result.provenance).toContain('changed since');
  });

  it('does not flag when the source changed before the override', () => {
    const result = resolveEffectiveValue({
      resourceCategory: 'PRODUCTS',
      mode: 'INHERIT_WITH_OVERRIDES',
      layers: [layer('MASTER_STORE', 'old', 'UK Master', new Date('2025-06-01')), LOCAL],
      overrideSetAt,
    });
    expect(result.isSourceStale).toBe(false);
  });
});

describe('REQUIRE_APPROVAL', () => {
  it('keeps the current value and surfaces the pending one', () => {
    const result = resolveEffectiveValue({
      resourceCategory: 'CUSTOMER_GROUPS',
      mode: 'REQUIRE_APPROVAL',
      layers: [layer('MASTER_STORE', 'new-master', 'UK Master', new Date('2026-02-01')), LOCAL],
      overrideSetAt: new Date('2026-01-01'),
    });
    expect(result.value).toBe('local-value');
    expect(result.pendingValue).toBe('new-master');
    expect(result.provenance).toContain('awaiting approval');
  });
});

describe('READ_ONLY_COMPARISON', () => {
  it('never claims a value will be written', () => {
    const result = resolveEffectiveValue({
      resourceCategory: 'TAX_CONFIGURATION',
      mode: 'READ_ONLY_COMPARISON',
      layers: [MASTER, LOCAL],
    });
    expect(result.provenance).toContain('never write');
    expect(modeAllowsWrite('READ_ONLY_COMPARISON')).toBe(false);
  });
});

describe('unsupported resources', () => {
  it('short-circuits with an explanation regardless of mode', () => {
    const result = resolveEffectiveValue({
      resourceCategory: 'NAVIGATION',
      mode: 'INHERIT_CONTINUOUS',
      layers: [MASTER, LOCAL],
      unsupportedReason: 'BigCommerce has no navigation resource.',
    });
    expect(result.isUnsupported).toBe(true);
    expect(result.origin).toBe('UNSUPPORTED');
    expect(result.provenance).toContain('Not supported by connected store');
  });
});

describe('mode predicates', () => {
  it('classifies which modes may write', () => {
    expect(modeAllowsWrite('INHERIT_CONTINUOUS')).toBe(true);
    expect(modeAllowsWrite('DO_NOT_INHERIT')).toBe(false);
    expect(modeAllowsWrite('READ_ONLY_COMPARISON')).toBe(false);
  });

  it('classifies which modes need approval', () => {
    expect(modeRequiresApproval('REQUIRE_APPROVAL')).toBe(true);
    expect(modeRequiresApproval('COPY_ONCE')).toBe(false);
  });

  it('classifies which modes protect an override', () => {
    expect(modeProtectsOverrides('INHERIT_WITH_OVERRIDES')).toBe(true);
    expect(modeProtectsOverrides('INHERIT_CONTINUOUS')).toBe(false);
  });
});

describe('policy selection', () => {
  const scope: StoreScopeIds = {
    organisationId: 'org-1',
    companyId: 'company-1',
    regionId: 'region-1',
    storeGroupIds: ['group-1'],
    storeId: 'store-1',
  };

  const policy = (
    scopeType: PolicyRecord['scopeType'],
    scopeId: string,
    mode: PolicyRecord['mode'],
  ): PolicyRecord => ({
    scopeType,
    scopeId,
    resourceCategory: 'PRODUCTS',
    mode,
    sourceType: 'MASTER_STORE',
    sourceId: null,
    isActive: true,
  });

  it('prefers the most specific scope', () => {
    const selected = selectPolicy(
      [
        policy('ORGANISATION', 'org-1', 'INHERIT_CONTINUOUS'),
        policy('COMPANY', 'company-1', 'COPY_ONCE'),
        policy('STORE', 'store-1', 'DO_NOT_INHERIT'),
      ],
      'PRODUCTS',
      scope,
    );
    expect(selected?.mode).toBe('DO_NOT_INHERIT');
  });

  it('falls back through the chain when no store policy exists', () => {
    const selected = selectPolicy(
      [
        policy('ORGANISATION', 'org-1', 'INHERIT_CONTINUOUS'),
        policy('COMPANY', 'company-1', 'COPY_ONCE'),
      ],
      'PRODUCTS',
      scope,
    );
    expect(selected?.mode).toBe('COPY_ONCE');
  });

  it('ignores policies belonging to a different scope id', () => {
    const selected = selectPolicy([policy('COMPANY', 'other-company', 'DO_NOT_INHERIT')], 'PRODUCTS', scope);
    expect(selected).toBeNull();
  });

  it('ignores inactive policies', () => {
    const inactive = { ...policy('STORE', 'store-1', 'DO_NOT_INHERIT'), isActive: false };
    const selected = selectPolicy([inactive], 'PRODUCTS', scope);
    expect(selected).toBeNull();
  });

  it('falls back to the platform default when nothing matches', () => {
    const result = effectiveMode([], 'PRODUCTS', scope);
    expect(result.mode).toBe(DEFAULT_INHERITANCE_MODE);
    expect(result.isDefault).toBe(true);
  });

  it('matches a store-group policy', () => {
    const selected = selectPolicy([policy('STORE_GROUP', 'group-1', 'READ_ONLY_COMPARISON')], 'PRODUCTS', scope);
    expect(selected?.mode).toBe('READ_ONLY_COMPARISON');
  });
});
