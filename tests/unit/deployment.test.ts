import { describe, expect, it } from 'vitest';

import {
  buildDeploymentPlan,
  confirmationMatches,
  type PlanResourceInput,
  type PlanTargetInput,
} from '@/lib/deployment/planner';

const target = (overrides: Partial<PlanTargetInput> = {}): PlanTargetInput => ({
  connectionId: 'store-1',
  connectionName: 'Acme US',
  capabilityStatus: 'AVAILABLE',
  capabilityReason: null,
  inheritanceMode: 'INHERIT_WITH_OVERRIDES',
  isDemo: false,
  isHealthy: true,
  overriddenKeys: new Set<string>(),
  currencyCode: 'USD',
  countryCode: 'US',
  ...overrides,
});

const resource = (key: string, overrides: Partial<PlanResourceInput> = {}): PlanResourceInput => ({
  key,
  label: `Product ${key}`,
  resourceType: 'product',
  sourceValue: { price: '89.00' },
  targetValueByConnection: new Map(),
  ...overrides,
});

const plan = (
  targets: PlanTargetInput[],
  resources: PlanResourceInput[],
  overrides: Partial<Parameters<typeof buildDeploymentPlan>[0]> = {},
) =>
  buildDeploymentPlan({
    resourceCategory: 'PRODUCTS',
    strategy: 'COPY_ONCE',
    targets,
    resources,
    preserveLocalOverrides: true,
    ...overrides,
  });

describe('capability gating', () => {
  it('excludes a target whose write capability is not implemented', () => {
    const result = plan([target({ capabilityStatus: 'NOT_IMPLEMENTED' })], [resource('SKU-1')]);
    expect(result.targets[0]!.willExecute).toBe(false);
    expect(result.targets[0]!.exclusionReason).toContain('not enabled in this release');
    expect(result.blastRadius.storeCount).toBe(0);
  });

  it('excludes a target missing the required scope', () => {
    const result = plan(
      [target({ capabilityStatus: 'PERMISSION_MISSING', capabilityReason: 'Missing store_v2_products.' })],
      [resource('SKU-1')],
    );
    expect(result.targets[0]!.willExecute).toBe(false);
    expect(result.targets[0]!.exclusionReason).toContain('store_v2_products');
  });

  it('excludes a read-only target', () => {
    const result = plan([target({ capabilityStatus: 'READ_ONLY' })], [resource('SKU-1')]);
    expect(result.targets[0]!.willExecute).toBe(false);
  });

  it('marks an unsupported target’s items as UNSUPPORTED', () => {
    const result = plan([target({ capabilityStatus: 'NOT_SUPPORTED' })], [resource('SKU-1')]);
    expect(result.targets[0]!.items[0]!.changeType).toBe('UNSUPPORTED');
    expect(result.blastRadius.unsupportedCount).toBe(1);
  });

  it('marks a manual-action target’s items as MANUAL and flags the target', () => {
    const result = plan([target({ capabilityStatus: 'MANUAL_ACTION' })], [resource('SKU-1')]);
    expect(result.targets[0]!.items[0]!.changeType).toBe('MANUAL');
    expect(result.targets[0]!.requiresManualAction).toBe(true);
  });

  it('excludes an unhealthy store even with a valid capability', () => {
    const result = plan([target({ isHealthy: false })], [resource('SKU-1')]);
    expect(result.targets[0]!.willExecute).toBe(false);
    expect(result.targets[0]!.exclusionReason).toContain('unhealthy');
  });
});

describe('inheritance gating', () => {
  it('excludes a read-only-comparison target', () => {
    const result = plan([target({ inheritanceMode: 'READ_ONLY_COMPARISON' })], [resource('SKU-1')]);
    expect(result.targets[0]!.willExecute).toBe(false);
    expect(result.targets[0]!.exclusionReason).toContain('read-only comparison');
  });

  it('excludes a target that does not inherit this resource', () => {
    const result = plan([target({ inheritanceMode: 'DO_NOT_INHERIT' })], [resource('SKU-1')]);
    expect(result.targets[0]!.willExecute).toBe(false);
    expect(result.targets[0]!.exclusionReason).toContain('does not inherit');
  });

  it('flags a target whose mode requires approval', () => {
    const result = plan([target({ inheritanceMode: 'REQUIRE_APPROVAL' })], [resource('SKU-1')]);
    expect(result.targets[0]!.requiresApproval).toBe(true);
    expect(result.requiresApproval).toBe(true);
  });
});

describe('local overrides', () => {
  it('skips an overridden record when overrides are preserved', () => {
    const result = plan([target({ overriddenKeys: new Set(['SKU-1']) })], [resource('SKU-1')]);
    expect(result.targets[0]!.items[0]!.changeType).toBe('NO_CHANGE');
    expect(result.targets[0]!.items[0]!.message).toContain('local override');
  });

  it('replaces an overridden record when overrides are not preserved, and marks it destructive', () => {
    const targetValueByConnection = new Map([['store-1', { price: '79.00' }]]);
    const result = plan(
      [target({ overriddenKeys: new Set(['SKU-1']) })],
      [resource('SKU-1', { targetValueByConnection })],
      { preserveLocalOverrides: false },
    );
    const item = result.targets[0]!.items[0]!;
    expect(item.changeType).toBe('UPDATE');
    expect(item.isDestructive).toBe(true);
    expect(result.blastRadius.destructiveCount).toBe(1);
  });

  it('warns when a deployment will replace local overrides', () => {
    const result = plan(
      [target({ overriddenKeys: new Set(['SKU-1']) })],
      [resource('SKU-1', { targetValueByConnection: new Map([['store-1', { price: '79.00' }]]) })],
      { preserveLocalOverrides: false },
    );
    expect(result.warnings.some((warning) => warning.includes('local overrides'))).toBe(true);
  });
});

describe('change classification', () => {
  it('plans a CREATE when the record is absent from the target', () => {
    const result = plan([target()], [resource('SKU-1')]);
    expect(result.targets[0]!.items[0]!.changeType).toBe('CREATE');
    expect(result.targets[0]!.items[0]!.message).toContain('new store-local id');
  });

  it('plans an UPDATE when the record differs', () => {
    const result = plan(
      [target()],
      [resource('SKU-1', { targetValueByConnection: new Map([['store-1', { price: '79.00' }]]) })],
    );
    expect(result.targets[0]!.items[0]!.changeType).toBe('UPDATE');
  });

  it('plans NO_CHANGE when the record already matches', () => {
    const result = plan(
      [target()],
      [resource('SKU-1', { targetValueByConnection: new Map([['store-1', { price: '89.00' }]]) })],
    );
    expect(result.targets[0]!.items[0]!.changeType).toBe('NO_CHANGE');
    expect(result.targets[0]!.willExecute).toBe(false);
    expect(result.targets[0]!.exclusionReason).toContain('Already in sync');
  });

  it('ADDITIVE_ONLY never touches an existing record', () => {
    const result = plan(
      [target()],
      [resource('SKU-1', { targetValueByConnection: new Map([['store-1', { price: '79.00' }]]) })],
      { strategy: 'ADDITIVE_ONLY' },
    );
    expect(result.targets[0]!.items[0]!.changeType).toBe('NO_CHANGE');
    expect(result.targets[0]!.items[0]!.message).toContain('only adds missing');
  });
});

describe('blast radius', () => {
  it('counts only targets that will actually execute', () => {
    const result = plan(
      [
        target({ connectionId: 's1', connectionName: 'A' }),
        target({ connectionId: 's2', connectionName: 'B', capabilityStatus: 'PERMISSION_MISSING' }),
      ],
      [resource('SKU-1')],
    );
    expect(result.blastRadius.storeCount).toBe(1);
    expect(result.blastRadius.storesExcluded).toBe(1);
  });

  it('separates live from simulated targets and warns when both are present', () => {
    const result = plan(
      [
        target({ connectionId: 's1', connectionName: 'Live', isDemo: false }),
        target({ connectionId: 's2', connectionName: 'Demo', isDemo: true }),
      ],
      [resource('SKU-1')],
    );
    expect(result.blastRadius.liveStoreCount).toBe(1);
    expect(result.blastRadius.simulatedStoreCount).toBe(1);
    expect(result.warnings.some((warning) => warning.includes('demo store'))).toBe(true);
  });

  it('collects the currencies and countries affected', () => {
    const result = plan(
      [
        target({ connectionId: 's1', currencyCode: 'USD', countryCode: 'US' }),
        target({ connectionId: 's2', currencyCode: 'GBP', countryCode: 'GB' }),
      ],
      [resource('SKU-1')],
    );
    expect(result.blastRadius.currenciesAffected).toEqual(['GBP', 'USD']);
    expect(result.blastRadius.countriesAffected).toEqual(['GB', 'US']);
  });

  it('warns when a pricing deployment spans currencies', () => {
    const result = plan(
      [
        target({ connectionId: 's1', currencyCode: 'USD' }),
        target({ connectionId: 's2', currencyCode: 'GBP' }),
      ],
      [resource('SKU-1')],
      { resourceCategory: 'PRICING' },
    );
    expect(result.warnings.some((warning) => warning.includes('not converted'))).toBe(true);
  });
});

describe('risk and confirmation', () => {
  it('rates a destructive live deployment as critical', () => {
    const result = plan(
      [target({ overriddenKeys: new Set(['SKU-1']) })],
      [resource('SKU-1', { targetValueByConnection: new Map([['store-1', { price: '79.00' }]]) })],
      { preserveLocalOverrides: false },
    );
    expect(result.riskLevel).toBe('CRITICAL');
    expect(result.requiresTypedConfirmation).toBe(true);
    expect(result.confirmationPhrase).toBeTruthy();
  });

  it('requires typed confirmation for an overwrite', () => {
    const result = plan([target()], [resource('SKU-1')], { strategy: 'OVERWRITE' });
    expect(result.requiresTypedConfirmation).toBe(true);
    expect(result.riskLevel).toBe('HIGH');
  });

  it('does not require typed confirmation for a small additive change', () => {
    const result = plan([target()], [resource('SKU-1')]);
    expect(result.requiresTypedConfirmation).toBe(false);
    expect(result.confirmationPhrase).toBeNull();
    expect(result.riskLevel).toBe('LOW');
  });

  it('escalates risk with the number of live stores', () => {
    const targets = Array.from({ length: 6 }, (_, index) =>
      target({ connectionId: `s${index}`, connectionName: `Store ${index}` }),
    );
    const result = plan(targets, [resource('SKU-1')]);
    expect(result.riskLevel).toBe('HIGH');
    expect(result.requiresTypedConfirmation).toBe(true);
  });
});

describe('validation', () => {
  it('surfaces resource-level validation errors as blocking', () => {
    const result = plan(
      [target()],
      [resource('SKU-1', { validationErrors: ['Currency mismatch would set a literal amount.'] })],
    );
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Currency mismatch');
  });

  it('blocks a deployment with no resources', () => {
    const result = plan([target()], []);
    expect(result.errors.some((error) => error.includes('nothing to deploy'))).toBe(true);
  });

  it('blocks a deployment with no targets', () => {
    const result = plan([], [resource('SKU-1')]);
    expect(result.errors.some((error) => error.includes('No target stores'))).toBe(true);
  });

  it('blocks when every target is excluded', () => {
    const result = plan([target({ capabilityStatus: 'PERMISSION_MISSING' })], [resource('SKU-1')]);
    expect(result.errors.some((error) => error.includes('Every selected store is excluded'))).toBe(true);
  });
});

describe('typed confirmation matching', () => {
  it('accepts an exact match', () => {
    expect(confirmationMatches('deploy products to 3 stores', 'deploy products to 3 stores')).toBe(true);
  });

  it('tolerates case and whitespace', () => {
    expect(confirmationMatches('deploy products to 3 stores', '  Deploy  Products To 3 STORES ')).toBe(true);
  });

  it('rejects a near miss', () => {
    expect(confirmationMatches('deploy products to 3 stores', 'deploy products to 4 stores')).toBe(false);
    expect(confirmationMatches('deploy products to 3 stores', 'yes')).toBe(false);
    expect(confirmationMatches('deploy products to 3 stores', '')).toBe(false);
  });

  it('passes when no confirmation is required', () => {
    expect(confirmationMatches(null, '')).toBe(true);
  });
});
