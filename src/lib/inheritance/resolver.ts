/**
 * Effective-configuration resolver.
 *
 * Given the layers that can contribute a value, works out which one actually
 * applies and — just as importantly — *why*. Every result carries its
 * provenance so the UI can say "Inherited from UK Master Store" rather than
 * showing a bare value.
 *
 * Precedence, least to most specific:
 *   1. Global default            (shipped with the platform)
 *   2. Organisation template
 *   3. Company template
 *   4. Master-store value
 *   5. Regional value
 *   6. Local store override
 *
 * The most specific *permitted* layer wins. "Permitted" is the subtlety: the
 * inheritance mode for the resource category decides whether a local override
 * is allowed to beat an inherited value at all.
 *
 * This module is pure — no database, no I/O — so the precedence rules can be
 * tested exhaustively.
 */
import type { InheritanceMode } from '@/lib/enums';
import type { ResourceCategory } from '@/lib/resource-categories';

export const LAYERS = [
  'GLOBAL_DEFAULT',
  'ORGANISATION_TEMPLATE',
  'COMPANY_TEMPLATE',
  'MASTER_STORE',
  'REGIONAL',
  'LOCAL_OVERRIDE',
] as const;

export type Layer = (typeof LAYERS)[number];

/** Specificity ranking. Higher wins, subject to the inheritance mode. */
export const LAYER_RANK: Record<Layer, number> = {
  GLOBAL_DEFAULT: 0,
  ORGANISATION_TEMPLATE: 1,
  COMPANY_TEMPLATE: 2,
  MASTER_STORE: 3,
  REGIONAL: 4,
  LOCAL_OVERRIDE: 5,
};

export const LAYER_LABELS: Record<Layer, string> = {
  GLOBAL_DEFAULT: 'Platform default',
  ORGANISATION_TEMPLATE: 'Organisation template',
  COMPANY_TEMPLATE: 'Company template',
  MASTER_STORE: 'Master store',
  REGIONAL: 'Regional value',
  LOCAL_OVERRIDE: 'Local override',
};

export interface LayerValue<T = unknown> {
  layer: Layer;
  value: T;
  /** Display name of the specific source, e.g. "UK Master Store". */
  sourceLabel: string;
  sourceId?: string;
  /** When the source value last changed — drives "source changed" detection. */
  updatedAt?: Date;
}

export type EffectiveOrigin =
  | 'GLOBAL_DEFAULT'
  | 'ORGANISATION_TEMPLATE'
  | 'COMPANY_TEMPLATE'
  | 'MASTER_STORE'
  | 'REGIONAL'
  | 'LOCAL_OVERRIDE'
  | 'NOT_SET'
  | 'UNSUPPORTED';

export interface EffectiveValue<T = unknown> {
  value: T | null;
  origin: EffectiveOrigin;
  /** One-line explanation shown next to the value in the UI. */
  provenance: string;
  sourceLabel: string | null;
  sourceId: string | null;
  /** The inheritance mode that produced this outcome. */
  mode: InheritanceMode;
  /** True when a local override exists and is winning. */
  isOverridden: boolean;
  /**
   * True when a local override exists but the mode does not allow it to win.
   * The override is retained but suppressed — the UI flags this clearly.
   */
  isOverrideSuppressed: boolean;
  /** True when the inherited source changed after the local override was set. */
  isSourceStale: boolean;
  /** True when the target store cannot support this resource at all. */
  isUnsupported: boolean;
  /** Layers that contributed a value, most specific first. */
  candidates: LayerValue<T>[];
  /** Pending value awaiting approval, when the mode requires one. */
  pendingValue?: T | null;
}

export interface ResolveInput<T = unknown> {
  resourceCategory: ResourceCategory;
  mode: InheritanceMode;
  layers: LayerValue<T>[];
  /** When the local override was recorded, for staleness detection. */
  overrideSetAt?: Date | null;
  /** Set when the connected store cannot support this category. */
  unsupportedReason?: string | null;
}

/**
 * Resolves the effective value for one resource key.
 */
export function resolveEffectiveValue<T>(input: ResolveInput<T>): EffectiveValue<T> {
  const { mode, unsupportedReason } = input;

  // Keep candidates most-specific-first for display.
  const candidates = [...input.layers].sort((a, b) => LAYER_RANK[b.layer] - LAYER_RANK[a.layer]);
  const local = candidates.find((candidate) => candidate.layer === 'LOCAL_OVERRIDE');
  const inheritedCandidates = candidates.filter(
    (candidate) => candidate.layer !== 'LOCAL_OVERRIDE',
  );
  const inherited = inheritedCandidates[0];

  if (unsupportedReason) {
    return {
      value: local?.value ?? inherited?.value ?? null,
      origin: 'UNSUPPORTED',
      provenance: `Not supported by connected store — ${unsupportedReason}`,
      sourceLabel: null,
      sourceId: null,
      mode,
      isOverridden: false,
      isOverrideSuppressed: false,
      isSourceStale: false,
      isUnsupported: true,
      candidates,
    };
  }

  const isSourceStale = Boolean(
    local &&
      input.overrideSetAt &&
      inherited?.updatedAt &&
      inherited.updatedAt.getTime() > input.overrideSetAt.getTime(),
  );

  const localWins = (): EffectiveValue<T> => ({
    value: local!.value,
    origin: 'LOCAL_OVERRIDE',
    provenance: isSourceStale
      ? `Overridden locally. ${inherited ? inherited.sourceLabel : 'The source'} has changed since this override was set.`
      : 'Overridden locally',
    sourceLabel: local!.sourceLabel,
    sourceId: local!.sourceId ?? null,
    mode,
    isOverridden: true,
    isOverrideSuppressed: false,
    isSourceStale,
    isUnsupported: false,
    candidates,
  });

  const inheritedWins = (suppressedOverride: boolean, note?: string): EffectiveValue<T> => {
    if (!inherited) {
      return {
        value: null,
        origin: 'NOT_SET',
        provenance: 'No value is set at any level.',
        sourceLabel: null,
        sourceId: null,
        mode,
        isOverridden: false,
        isOverrideSuppressed: suppressedOverride,
        isSourceStale: false,
        isUnsupported: false,
        candidates,
      };
    }
    return {
      value: inherited.value,
      origin: inherited.layer,
      provenance: note ?? `Inherited from ${inherited.sourceLabel}`,
      sourceLabel: inherited.sourceLabel,
      sourceId: inherited.sourceId ?? null,
      mode,
      isOverridden: false,
      isOverrideSuppressed: suppressedOverride,
      isSourceStale,
      isUnsupported: false,
      candidates,
    };
  };

  switch (mode) {
    case 'DO_NOT_INHERIT':
      // Only local values apply; anything inherited is ignored entirely.
      return local
        ? { ...localWins(), provenance: 'Managed locally — this store does not inherit this resource.' }
        : {
            value: null,
            origin: 'NOT_SET',
            provenance: 'Managed locally, but no value has been set yet.',
            sourceLabel: null,
            sourceId: null,
            mode,
            isOverridden: false,
            isOverrideSuppressed: false,
            isSourceStale: false,
            isUnsupported: false,
            candidates: candidates.filter((candidate) => candidate.layer === 'LOCAL_OVERRIDE'),
          };

    case 'INHERIT_CONTINUOUS':
      // The source always wins; a stored override is kept but suppressed.
      return inheritedWins(
        Boolean(local),
        inherited
          ? `Inherited from ${inherited.sourceLabel}${local ? ' — the local value is suppressed by continuous inheritance' : ''}`
          : undefined,
      );

    case 'COPY_ONCE':
      // After the initial copy the store owns the value outright.
      return local
        ? {
            ...localWins(),
            isSourceStale: false,
            provenance: `Copied once from ${inherited?.sourceLabel ?? 'the source'}, then managed locally.`,
          }
        : inheritedWins(false, inherited ? `Will be copied from ${inherited.sourceLabel}` : undefined);

    case 'INHERIT_WITH_OVERRIDES':
      return local ? localWins() : inheritedWins(false);

    case 'REQUIRE_APPROVAL':
      // The current value stays put; the inherited change waits for a decision.
      if (local) {
        return {
          ...localWins(),
          pendingValue: isSourceStale ? (inherited?.value ?? null) : null,
          provenance: isSourceStale
            ? `Overridden locally. An update from ${inherited?.sourceLabel} is awaiting approval.`
            : 'Overridden locally. Source changes require approval before they apply.',
        };
      }
      return {
        ...inheritedWins(false),
        provenance: inherited
          ? `Inherited from ${inherited.sourceLabel}. Further changes require approval.`
          : 'No value set. Changes require approval.',
      };

    case 'READ_ONLY_COMPARISON':
      // Nothing is ever written; report the local reality, note the difference.
      return {
        value: local?.value ?? inherited?.value ?? null,
        origin: local ? 'LOCAL_OVERRIDE' : (inherited?.layer ?? 'NOT_SET'),
        provenance: inherited
          ? `Read-only comparison against ${inherited.sourceLabel}. This platform will never write this value.`
          : 'Read-only comparison. No source value is configured.',
        sourceLabel: local?.sourceLabel ?? inherited?.sourceLabel ?? null,
        sourceId: local?.sourceId ?? inherited?.sourceId ?? null,
        mode,
        isOverridden: Boolean(local),
        isOverrideSuppressed: false,
        isSourceStale,
        isUnsupported: false,
        candidates,
      };

    default:
      return inheritedWins(false);
  }
}

/** True when this mode allows the platform to write to the target store. */
export function modeAllowsWrite(mode: InheritanceMode): boolean {
  return mode !== 'READ_ONLY_COMPARISON' && mode !== 'DO_NOT_INHERIT';
}

/** True when a change under this mode must be approved before it applies. */
export function modeRequiresApproval(mode: InheritanceMode): boolean {
  return mode === 'REQUIRE_APPROVAL';
}

/** True when a local override survives future source changes. */
export function modeProtectsOverrides(mode: InheritanceMode): boolean {
  return (
    mode === 'INHERIT_WITH_OVERRIDES' ||
    mode === 'COPY_ONCE' ||
    mode === 'DO_NOT_INHERIT' ||
    mode === 'REQUIRE_APPROVAL'
  );
}

/**
 * Picks the policy that applies to a store for one category, given policies
 * defined at several scopes. The most specific scope wins.
 */
export interface PolicyRecord {
  scopeType: 'ORGANISATION' | 'COMPANY' | 'REGION' | 'STORE_GROUP' | 'STORE';
  scopeId: string;
  resourceCategory: string;
  mode: InheritanceMode;
  sourceType: string;
  sourceId: string | null;
  isActive: boolean;
}

const SCOPE_RANK: Record<PolicyRecord['scopeType'], number> = {
  ORGANISATION: 0,
  COMPANY: 1,
  REGION: 2,
  STORE_GROUP: 3,
  STORE: 4,
};

export interface StoreScopeIds {
  organisationId: string;
  companyId: string;
  regionId: string | null;
  storeGroupIds: string[];
  storeId: string;
}

export const DEFAULT_INHERITANCE_MODE: InheritanceMode = 'INHERIT_WITH_OVERRIDES';

export function selectPolicy(
  policies: readonly PolicyRecord[],
  category: ResourceCategory,
  scope: StoreScopeIds,
): PolicyRecord | null {
  const applicable = policies.filter((policy) => {
    if (!policy.isActive || policy.resourceCategory !== category) return false;
    switch (policy.scopeType) {
      case 'ORGANISATION':
        return policy.scopeId === scope.organisationId;
      case 'COMPANY':
        return policy.scopeId === scope.companyId;
      case 'REGION':
        return scope.regionId !== null && policy.scopeId === scope.regionId;
      case 'STORE_GROUP':
        return scope.storeGroupIds.includes(policy.scopeId);
      case 'STORE':
        return policy.scopeId === scope.storeId;
      default:
        return false;
    }
  });

  if (applicable.length === 0) return null;
  return applicable.reduce((best, candidate) =>
    SCOPE_RANK[candidate.scopeType] > SCOPE_RANK[best.scopeType] ? candidate : best,
  );
}

export function effectiveMode(
  policies: readonly PolicyRecord[],
  category: ResourceCategory,
  scope: StoreScopeIds,
): { mode: InheritanceMode; policy: PolicyRecord | null; isDefault: boolean } {
  const policy = selectPolicy(policies, category, scope);
  return {
    mode: policy?.mode ?? DEFAULT_INHERITANCE_MODE,
    policy,
    isDefault: policy === null,
  };
}
