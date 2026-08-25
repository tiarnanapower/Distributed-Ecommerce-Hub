import { describe, expect, it } from 'vitest';

import {
  CAPABILITY_DEFINITIONS,
  CAPABILITY_LIST,
  MINIMUM_READ_SCOPES,
  allUsefulScopes,
  capabilityDefinition,
  isOperational,
  isReadable,
  resolveCapabilityStatus,
} from '@/lib/commerce/capability-registry';
import { CAPABILITY_KEYS, isCapabilityKey } from '@/lib/commerce/capability-keys';

const FULL_SCOPES = [
  'store_v2_products',
  'store_v2_products_read_only',
  'store_v2_orders',
  'store_v2_orders_read_only',
  'store_v2_customers',
  'store_v2_customers_read_only',
  'store_v2_content',
  'store_v2_content_read_only',
  'store_v2_information',
  'store_v2_information_read_only',
  'store_v2_marketing',
  'store_v2_marketing_read_only',
  'store_channel_settings',
  'store_channel_settings_read_only',
  'store_channel_listings',
  'store_channel_listings_read_only',
  'store_sites',
  'store_sites_read_only',
  'store_themes_manage',
  'store_themes_read_only',
  'store_inventory',
  'store_inventory_read_only',
  'store_locations_read_only',
  'store_v2_transactions_read_only',
  'store_order_fulfillment_read_only',
];

describe('registry integrity', () => {
  it('defines every declared capability key', () => {
    for (const key of CAPABILITY_KEYS) {
      expect(CAPABILITY_DEFINITIONS[key], `missing definition for ${key}`).toBeDefined();
      expect(CAPABILITY_DEFINITIONS[key].key).toBe(key);
    }
    expect(CAPABILITY_LIST).toHaveLength(CAPABILITY_KEYS.length);
  });

  it('recognises valid keys and rejects invalid ones', () => {
    expect(isCapabilityKey('products.read')).toBe(true);
    expect(isCapabilityKey('products.teleport')).toBe(false);
    expect(capabilityDefinition('nope')).toBeUndefined();
  });

  it('gives every non-available capability a reason', () => {
    for (const definition of CAPABILITY_LIST) {
      if (definition.defaultStatus === 'AVAILABLE' || definition.defaultStatus === 'READ_ONLY') continue;
      expect(definition.unavailableReason, `${definition.key} lacks a reason`).toBeTruthy();
    }
  });

  it('never marks a write operation as available by default', () => {
    // The integration layer implements reads only, so any write claiming to be
    // available would be a lie the UI would then act on.
    for (const definition of CAPABILITY_LIST) {
      if (!definition.isWrite) continue;
      expect(definition.defaultStatus, `${definition.key} claims to be available`).not.toBe('AVAILABLE');
    }
  });

  it('requires confirmation for every write that could ever run', () => {
    // NOT_SUPPORTED writes are exempt: there is no API to invoke, so there is
    // nothing to confirm. Everything else must be gated.
    for (const definition of CAPABILITY_LIST) {
      if (!definition.isWrite || definition.defaultStatus === 'NOT_SUPPORTED') continue;
      expect(definition.requiresConfirmation, `${definition.key} needs confirmation`).toBe(true);
    }
  });

  it('gives every implemented capability a required scope', () => {
    for (const definition of CAPABILITY_LIST) {
      if (definition.defaultStatus === 'NOT_SUPPORTED') continue;
      expect(definition.requiredScope, `${definition.key} has no scope`).toBeTruthy();
    }
  });

  it('uses only real BigCommerce scope strings', () => {
    // Guards against inventing a scope name. Every value must be one of the
    // documented machine-readable scopes.
    const valid = new Set([...FULL_SCOPES, 'store_v2_content_read_only']);
    for (const definition of CAPABILITY_LIST) {
      for (const scope of [definition.requiredScope, definition.readScope]) {
        if (!scope) continue;
        expect(valid.has(scope), `${definition.key} uses unknown scope ${scope}`).toBe(true);
      }
    }
  });

  it('lists the minimum read scopes among those it uses', () => {
    const used = new Set(allUsefulScopes().map((entry) => entry.scope));
    for (const scope of MINIMUM_READ_SCOPES) {
      expect(used.has(scope), `${scope} is documented as required but unused`).toBe(true);
    }
  });
});

describe('scope-based resolution', () => {
  it('downgrades a write to read-only when only the read scope is granted', () => {
    const result = resolveCapabilityStatus(CAPABILITY_DEFINITIONS['products.update'], {
      grantedScopes: ['store_v2_products_read_only'],
    });
    expect(result.status).toBe('READ_ONLY');
    expect(result.reason).toContain('store_v2_products');
  });

  it('reports permission missing when neither scope is granted', () => {
    const result = resolveCapabilityStatus(CAPABILITY_DEFINITIONS['products.update'], {
      grantedScopes: ['store_v2_orders_read_only'],
    });
    expect(result.status).toBe('PERMISSION_MISSING');
    expect(result.reason).toContain('store_v2_products');
  });

  it('reports permission missing for a read whose scope is absent', () => {
    const result = resolveCapabilityStatus(CAPABILITY_DEFINITIONS['products.read'], {
      grantedScopes: ['store_v2_orders_read_only'],
    });
    expect(result.status).toBe('PERMISSION_MISSING');
  });

  it('leaves a read available when its scope is granted', () => {
    const result = resolveCapabilityStatus(CAPABILITY_DEFINITIONS['products.read'], {
      grantedScopes: FULL_SCOPES,
    });
    expect(result.status).toBe('AVAILABLE');
  });

  it('falls back to the registry default when scopes are unknown', () => {
    const result = resolveCapabilityStatus(CAPABILITY_DEFINITIONS['orders.read'], {
      grantedScopes: null,
    });
    expect(result.status).toBe('AVAILABLE');
  });

  it('treats an empty scope list as unknown, not as "none granted"', () => {
    // BigCommerce has no endpoint that introspects an API account token's
    // scopes, so an empty list is the normal state for a freshly connected
    // live store. Reading it as "nothing is granted" would paint every
    // capability permission-missing and make the matrix actively misleading.
    for (const key of ['products.read', 'orders.read', 'customers.read'] as const) {
      const result = resolveCapabilityStatus(CAPABILITY_DEFINITIONS[key], { grantedScopes: [] });
      expect(result.status, `${key} should fall back to its default`).toBe(
        CAPABILITY_DEFINITIONS[key].defaultStatus,
      );
    }
  });

  it('still reports permission-missing when scopes are known and one is absent', () => {
    const result = resolveCapabilityStatus(CAPABILITY_DEFINITIONS['products.read'], {
      grantedScopes: ['store_v2_orders_read_only'],
    });
    expect(result.status).toBe('PERMISSION_MISSING');
  });
});

describe('plan and structural gating', () => {
  it('keeps NOT_SUPPORTED regardless of scopes', () => {
    const result = resolveCapabilityStatus(CAPABILITY_DEFINITIONS['store_provisioning.create'], {
      grantedScopes: FULL_SCOPES,
    });
    expect(result.status).toBe('NOT_SUPPORTED');
    expect(result.reason).toContain('billing');
  });

  it('blocks navigation management, which has no API at all', () => {
    const result = resolveCapabilityStatus(CAPABILITY_DEFINITIONS['navigation.manage'], {
      grantedScopes: FULL_SCOPES,
    });
    expect(result.status).toBe('NOT_SUPPORTED');
  });

  it('blocks channel creation when Multi-Storefront is absent', () => {
    const result = resolveCapabilityStatus(CAPABILITY_DEFINITIONS['channels.create'], {
      grantedScopes: FULL_SCOPES,
      multiStorefrontEnabled: false,
    });
    expect(result.status).toBe('PLAN_DEPENDENT');
    expect(result.reason).toContain('Multi-Storefront');
  });

  it('blocks channel creation when every storefront seat is used', () => {
    const result = resolveCapabilityStatus(CAPABILITY_DEFINITIONS['channels.create'], {
      grantedScopes: FULL_SCOPES,
      multiStorefrontEnabled: true,
      hasSpareStorefrontCapacity: false,
    });
    expect(result.status).toBe('PLAN_DEPENDENT');
    expect(result.reason).toContain('seat');
  });

  it('keeps refunds as a manual action even with full scopes', () => {
    const result = resolveCapabilityStatus(CAPABILITY_DEFINITIONS['orders.create_refund'], {
      grantedScopes: FULL_SCOPES,
    });
    expect(result.status).toBe('MANUAL_ACTION');
    expect(result.reason).toContain('cannot be undone');
  });

  it('labels a demo store’s unimplemented writes as simulated', () => {
    const result = resolveCapabilityStatus(CAPABILITY_DEFINITIONS['products.update'], {
      grantedScopes: FULL_SCOPES,
      isDemo: true,
    });
    expect(result.status).toBe('NOT_IMPLEMENTED');
    expect(result.reason).toContain('Simulated in demo mode');
  });
});

describe('status predicates', () => {
  it('treats only AVAILABLE as operational', () => {
    expect(isOperational('AVAILABLE')).toBe(true);
    expect(isOperational('READ_ONLY')).toBe(false);
    expect(isOperational('NOT_IMPLEMENTED')).toBe(false);
    expect(isOperational('MANUAL_ACTION')).toBe(false);
  });

  it('treats AVAILABLE and READ_ONLY as readable', () => {
    expect(isReadable('AVAILABLE')).toBe(true);
    expect(isReadable('READ_ONLY')).toBe(true);
    expect(isReadable('PERMISSION_MISSING')).toBe(false);
  });
});
