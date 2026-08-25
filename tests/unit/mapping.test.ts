import { describe, expect, it } from 'vitest';

import {
  mapCategories,
  mapCustomerGroups,
  mapProducts,
  type MappableProduct,
} from '@/lib/comparison/mapping';

const product = (externalId: number, sku: string, name: string): MappableProduct => ({
  externalId,
  sku,
  name,
});

describe('product mapping', () => {
  it('matches on SKU even when ids differ completely', () => {
    // This is the whole point: id 101 in the master is id 907 in the target.
    const { matches } = mapProducts(
      [product(101, 'AH-KETTLE-1000', 'Kettle')],
      [product(907, 'AH-KETTLE-1000', 'Kettle')],
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      masterProductId: 101,
      targetProductId: 907,
      status: 'MAPPED',
      strategy: 'SKU',
      confidence: 1,
    });
  });

  it('never matches on id alone', () => {
    const { matches } = mapProducts(
      [product(101, 'SKU-A', 'Product A')],
      [product(101, 'SKU-B', 'Product B')],
    );
    // Same id, different SKU — must not be treated as the same product.
    expect(matches[0]!.status).toBe('MISSING_IN_TARGET');
    expect(matches[0]!.targetProductId).toBeNull();
  });

  it('normalises SKU case and separators', () => {
    const { matches } = mapProducts(
      [product(1, 'ah-kettle_1000', 'Kettle')],
      [product(2, 'AH-KETTLE-1000', 'Kettle')],
    );
    expect(matches[0]!.status).toBe('MAPPED');
  });

  it('reports a product missing from the target', () => {
    const { matches } = mapProducts([product(1, 'SKU-A', 'A')], []);
    expect(matches[0]!.status).toBe('MISSING_IN_TARGET');
  });

  it('reports products that exist only in the target', () => {
    const { extraInTarget } = mapProducts([product(1, 'SKU-A', 'A')], [product(9, 'SKU-LOCAL', 'Local only')]);
    expect(extraInTarget).toHaveLength(1);
    expect(extraInTarget[0]!.sku).toBe('SKU-LOCAL');
  });

  it('refuses to guess when the target has duplicate SKUs', () => {
    const { matches } = mapProducts(
      [product(1, 'SKU-A', 'A')],
      [product(10, 'SKU-A', 'A one'), product(11, 'SKU-A', 'A two')],
    );
    expect(matches[0]!.status).toBe('AMBIGUOUS');
    expect(matches[0]!.targetProductId).toBeNull();
    expect(matches[0]!.reviewReason).toContain('2 products with SKU');
  });

  it('flags a source product with no SKU as ambiguous rather than dropping it', () => {
    const { matches } = mapProducts([product(1, '', 'No SKU')], [product(2, 'SKU-A', 'A')]);
    expect(matches[0]!.status).toBe('AMBIGUOUS');
    expect(matches[0]!.reviewReason).toContain('no SKU');
  });

  it('falls back to name matching at low confidence, marked for review', () => {
    const { matches } = mapProducts(
      [product(1, 'SKU-OLD', 'Meridian Kettle')],
      [product(2, 'SKU-NEW', 'Meridian Kettle')],
    );
    expect(matches[0]!.status).toBe('MANUAL');
    expect(matches[0]!.strategy).toBe('NAME');
    expect(matches[0]!.confidence).toBeLessThan(1);
    expect(matches[0]!.reviewReason).toContain('Confirm before deploying');
  });

  it('can be told not to fall back to names', () => {
    const { matches } = mapProducts(
      [product(1, 'SKU-OLD', 'Meridian Kettle')],
      [product(2, 'SKU-NEW', 'Meridian Kettle')],
      { allowNameFallback: false },
    );
    expect(matches[0]!.status).toBe('MISSING_IN_TARGET');
  });

  it('does not consume the same target twice', () => {
    const { matches, extraInTarget } = mapProducts(
      [product(1, 'SKU-A', 'A'), product(2, 'SKU-B', 'B')],
      [product(10, 'SKU-A', 'A'), product(11, 'SKU-B', 'B')],
    );
    expect(matches.every((match) => match.status === 'MAPPED')).toBe(true);
    expect(extraInTarget).toHaveLength(0);
  });
});

describe('customer group mapping', () => {
  it('matches exact names', () => {
    const matches = mapCustomerGroups(['Trade Gold'], [{ externalId: 27, name: 'Trade Gold' }]);
    expect(matches[0]).toMatchObject({ status: 'MAPPED', targetGroupId: 27 });
  });

  it('does not assume numeric ids are portable', () => {
    // The same name maps to a different id in each store, which is expected.
    const storeA = mapCustomerGroups(['Trade Gold'], [{ externalId: 13, name: 'Trade Gold' }]);
    const storeB = mapCustomerGroups(['Trade Gold'], [{ externalId: 27, name: 'Trade Gold' }]);
    expect(storeA[0]!.targetGroupId).toBe(13);
    expect(storeB[0]!.targetGroupId).toBe(27);
    expect(storeA[0]!.status).toBe('MAPPED');
    expect(storeB[0]!.status).toBe('MAPPED');
  });

  it('flags a near-miss name as a conflict rather than creating a duplicate', () => {
    const matches = mapCustomerGroups(['Trade Silver'], [{ externalId: 5, name: 'Trade  Silver' }]);
    expect(matches[0]!.status).toBe('NAME_CONFLICT');
    expect(matches[0]!.note).toContain('duplicate group');
  });

  it('treats a case difference as a conflict too', () => {
    const matches = mapCustomerGroups(['Trade Gold'], [{ externalId: 5, name: 'trade gold' }]);
    expect(matches[0]!.status).toBe('NAME_CONFLICT');
  });

  it('reports a group missing from the target and warns about the new id', () => {
    const matches = mapCustomerGroups(['Distributor'], [{ externalId: 1, name: 'Retail' }]);
    expect(matches[0]!.status).toBe('MISSING_IN_TARGET');
    expect(matches[0]!.note).toContain('new numeric id');
  });

  it('handles a group whose id is not yet known', () => {
    const matches = mapCustomerGroups(['Retail'], [{ externalId: null, name: 'Retail' }]);
    expect(matches[0]!.status).toBe('MAPPED');
    expect(matches[0]!.targetGroupId).toBeNull();
  });
});

describe('category mapping', () => {
  it('matches on full path rather than id', () => {
    const { matches } = mapCategories(
      [{ externalId: 20, path: 'Kitchen / Cookware' }],
      [{ externalId: 88, path: 'Kitchen / Cookware' }],
    );
    expect(matches[0]).toMatchObject({ targetCategoryId: 88, status: 'MAPPED' });
  });

  it('normalises spacing around path separators', () => {
    const { matches } = mapCategories(
      [{ externalId: 20, path: 'Kitchen/Cookware' }],
      [{ externalId: 88, path: 'Kitchen / Cookware' }],
    );
    expect(matches[0]!.status).toBe('MAPPED');
  });

  it('reports categories missing from the target', () => {
    const { matches } = mapCategories([{ externalId: 20, path: 'Outdoor / Tents' }], []);
    expect(matches[0]!.status).toBe('MISSING_IN_TARGET');
  });

  it('reports extra categories in the target', () => {
    const { extraInTarget } = mapCategories(
      [{ externalId: 20, path: 'Kitchen' }],
      [{ externalId: 20, path: 'Kitchen' }, { externalId: 21, path: 'Clearance' }],
    );
    expect(extraInTarget).toHaveLength(1);
    expect(extraInTarget[0]!.path).toBe('Clearance');
  });
});
