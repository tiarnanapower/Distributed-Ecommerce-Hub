import { describe, expect, it } from 'vitest';

import {
  PRODUCT_FIELD_SPECS,
  compareRecord,
  detectExtra,
  detectMissing,
  type ComparableRecord,
} from '@/lib/comparison/diff';

const record = (key: string, fields: Record<string, unknown>): ComparableRecord => ({
  key,
  label: fields.name ? String(fields.name) : key,
  fields,
});

const OPTIONS = {
  resourceCategory: 'PRODUCTS' as const,
  resourceType: 'product',
  fields: PRODUCT_FIELD_SPECS,
};

describe('value comparison', () => {
  it('returns null when the records agree', () => {
    const same = { name: 'Kettle', price: '89.00', isVisible: true };
    expect(compareRecord(record('SKU-1', same), record('SKU-1', same), OPTIONS)).toBeNull();
  });

  it('treats equivalent decimals as equal', () => {
    const conflict = compareRecord(
      record('SKU-1', { name: 'Kettle', price: '89.5' }),
      record('SKU-1', { name: 'Kettle', price: '89.50' }),
      OPTIONS,
    );
    expect(conflict).toBeNull();
  });

  it('detects a genuine price difference in the same currency', () => {
    const conflict = compareRecord(
      record('SKU-1', { name: 'Kettle', price: '89.00' }),
      record('SKU-1', { name: 'Kettle', price: '79.00' }),
      { ...OPTIONS, sourceCurrency: 'GBP', targetCurrency: 'GBP' },
    );
    expect(conflict).not.toBeNull();
    expect(conflict!.conflictType).toBe('VALUE_MISMATCH');
    expect(conflict!.diff.map((entry) => entry.field)).toContain('price');
    expect(conflict!.severity).toBe('HIGH');
  });

  it('does not treat a price difference across currencies as drift', () => {
    const conflict = compareRecord(
      record('SKU-1', { name: 'Kettle', price: '89.00' }),
      record('SKU-1', { name: 'Kettle', price: '117.99' }),
      { ...OPTIONS, sourceCurrency: 'GBP', targetCurrency: 'USD' },
    );
    // A GBP price and a USD price differing is the entire point of a multi-market
    // estate — it must not be reported as a problem.
    expect(conflict).toBeNull();
  });

  it('still detects a non-price difference across currencies', () => {
    const conflict = compareRecord(
      record('SKU-1', { name: 'Kettle', price: '89.00', isVisible: true }),
      record('SKU-1', { name: 'Kettle', price: '117.99', isVisible: false }),
      { ...OPTIONS, sourceCurrency: 'GBP', targetCurrency: 'USD' },
    );
    expect(conflict).not.toBeNull();
    const fields = conflict!.diff.filter((entry) => !entry.isExpectedVariance).map((entry) => entry.field);
    expect(fields).toContain('isVisible');
    expect(fields).not.toContain('price');
  });

  it('marks fields that legitimately vary as expected variance', () => {
    const conflict = compareRecord(
      record('SKU-1', { name: 'Kettle', seoTitle: 'Buy a kettle', inventoryLevel: 10, isVisible: true }),
      record('SKU-1', { name: 'Kettle', seoTitle: 'Wasserkocher kaufen', inventoryLevel: 3, isVisible: false }),
      OPTIONS,
    );
    expect(conflict).not.toBeNull();
    const expected = conflict!.diff.filter((entry) => entry.isExpectedVariance).map((entry) => entry.field);
    expect(expected).toContain('seoTitle');
    expect(expected).toContain('inventoryLevel');
  });

  it('returns null when only expected-variance fields differ', () => {
    const conflict = compareRecord(
      record('SKU-1', { name: 'Kettle', seoTitle: 'A', inventoryLevel: 10 }),
      record('SKU-1', { name: 'Kettle', seoTitle: 'B', inventoryLevel: 3 }),
      OPTIONS,
    );
    expect(conflict).toBeNull();
  });

  it('compares arrays without regard to order', () => {
    const conflict = compareRecord(
      record('SKU-1', { name: 'Kettle', categoryNames: ['Kitchen', 'Appliances'] }),
      record('SKU-1', { name: 'Kettle', categoryNames: ['Appliances', 'Kitchen'] }),
      OPTIONS,
    );
    expect(conflict).toBeNull();
  });
});

describe('conflict classification', () => {
  const differing = () => ({
    source: record('SKU-1', { name: 'Kettle', price: '89.00' }),
    target: record('SKU-1', { name: 'Kettle', price: '79.00' }),
  });

  it('classifies an unexplained difference as a value mismatch', () => {
    const { source, target } = differing();
    const conflict = compareRecord(source, target, OPTIONS);
    expect(conflict!.conflictType).toBe('VALUE_MISMATCH');
    expect(conflict!.explanation).toContain('no override recorded');
  });

  it('classifies an explained difference as a local override, at lower severity', () => {
    const { source, target } = differing();
    const conflict = compareRecord(source, target, {
      ...OPTIONS,
      overriddenKeys: new Set(['SKU-1']),
    });
    expect(conflict!.conflictType).toBe('LOCAL_OVERRIDE');
    expect(conflict!.severity).toBe('LOW');
    expect(conflict!.explanation).toContain('deliberate local override');
  });

  it('escalates when the source changed after the override', () => {
    const { source, target } = differing();
    const conflict = compareRecord(source, target, {
      ...OPTIONS,
      overriddenKeys: new Set(['SKU-1']),
      staleOverrideKeys: new Set(['SKU-1']),
    });
    expect(conflict!.conflictType).toBe('SOURCE_CHANGED_AFTER_OVERRIDE');
    expect(conflict!.severity).not.toBe('LOW');
    expect(conflict!.explanation).toContain('changed since');
  });

  it('short-circuits when the target cannot support the resource', () => {
    const { source, target } = differing();
    const conflict = compareRecord(source, target, {
      ...OPTIONS,
      unsupportedReason: 'No public API exists for this resource.',
    });
    expect(conflict!.conflictType).toBe('UNSUPPORTED_TARGET_CAPABILITY');
    expect(conflict!.diff).toHaveLength(0);
    expect(conflict!.explanation).toContain('No public API');
  });

  it('short-circuits when the scope to read the resource is missing', () => {
    const { source, target } = differing();
    const conflict = compareRecord(source, target, {
      ...OPTIONS,
      permissionMissingReason: 'The API account lacks store_v2_products_read_only.',
    });
    expect(conflict!.conflictType).toBe('PERMISSION_MISSING');
    expect(conflict!.severity).toBe('MEDIUM');
  });

  it('prefers the unsupported verdict over the permission one', () => {
    const { source, target } = differing();
    const conflict = compareRecord(source, target, {
      ...OPTIONS,
      unsupportedReason: 'No API.',
      permissionMissingReason: 'No scope.',
    });
    expect(conflict!.conflictType).toBe('UNSUPPORTED_TARGET_CAPABILITY');
  });
});

describe('presence detection', () => {
  const sources = [record('SKU-1', { name: 'A' }), record('SKU-2', { name: 'B' })];

  it('reports source records with no match in the target', () => {
    const missing = detectMissing(sources, new Set(['SKU-1']), OPTIONS);
    expect(missing).toHaveLength(1);
    expect(missing[0]!.resourceKey).toBe('SKU-2');
    expect(missing[0]!.conflictType).toBe('MISSING_IN_TARGET');
    expect(missing[0]!.targetValue).toBeNull();
  });

  it('reports target records with no match in the source', () => {
    const extra = detectExtra([record('SKU-LOCAL', { name: 'Local' })], new Set(), OPTIONS);
    expect(extra).toHaveLength(1);
    expect(extra[0]!.conflictType).toBe('EXTRA_IN_TARGET');
    expect(extra[0]!.severity).toBe('LOW');
    expect(extra[0]!.explanation).toContain('deliberate local product');
  });

  it('reports nothing when everything matched', () => {
    expect(detectMissing(sources, new Set(['SKU-1', 'SKU-2']), OPTIONS)).toHaveLength(0);
  });
});
