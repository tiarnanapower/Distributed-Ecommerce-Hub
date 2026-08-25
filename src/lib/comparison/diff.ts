/**
 * Field-level comparison and conflict detection.
 *
 * Pure functions that turn "here is the source record and the target record"
 * into a list of typed conflicts, with the local-override and capability rules
 * applied. The service layer persists whatever comes out.
 */
import type { ConflictType, RiskLevel } from '@/lib/enums';
import type { ResourceCategory } from '@/lib/resource-categories';
import { money, toDecimalString, type CurrencyCode } from '@/lib/money';

/**
 * Conflict severity uses the LOW/MEDIUM/HIGH/CRITICAL scale, which is the same
 * shape as RiskLevel. It is deliberately not the notification `Severity` scale
 * (INFO/SUCCESS/WARNING/CRITICAL) — those two mean different things.
 */
export type ConflictSeverity = RiskLevel;

export interface FieldDiff {
  field: string;
  label: string;
  sourceValue: unknown;
  targetValue: unknown;
  /** True when the difference is expected — currency, locale, market pricing. */
  isExpectedVariance: boolean;
  note?: string;
}

export interface DetectedConflict {
  resourceCategory: ResourceCategory;
  conflictType: ConflictType;
  resourceType: string;
  resourceKey: string;
  resourceLabel: string;
  sourceValue: unknown;
  targetValue: unknown;
  diff: FieldDiff[];
  severity: ConflictSeverity;
  /** Why this matters, in plain language. */
  explanation: string;
}

export interface ComparableRecord {
  key: string;
  label: string;
  fields: Record<string, unknown>;
}

export interface FieldSpec {
  field: string;
  label: string;
  /** Fields that legitimately vary per market are never flagged as drift. */
  expectedVariance?: boolean;
  /** Compare as an exact decimal rather than a string. */
  isMoney?: boolean;
  severity?: ConflictSeverity;
}

export interface CompareOptions {
  resourceCategory: ResourceCategory;
  resourceType: string;
  fields: FieldSpec[];
  /** Keys with a recorded local override. */
  overriddenKeys?: ReadonlySet<string>;
  /** Keys whose override predates a source change. */
  staleOverrideKeys?: ReadonlySet<string>;
  /** Set when the target store cannot support this category at all. */
  unsupportedReason?: string | null;
  /** Set when the API token lacks the scope to read or write this resource. */
  permissionMissingReason?: string | null;
  sourceCurrency?: CurrencyCode;
  targetCurrency?: CurrencyCode;
}

function valuesEqual(a: unknown, b: unknown, spec: FieldSpec): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) {
    return (a ?? null) === (b ?? null);
  }
  if (spec.isMoney) {
    // Compare exact decimals, so "10.5" and "10.50" are the same price.
    try {
      return (
        toDecimalString(money(String(a), 'USD')) === toDecimalString(money(String(b), 'USD'))
      );
    } catch {
      return String(a) === String(b);
    }
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const left = [...a].map(String).sort();
    const right = [...b].map(String).sort();
    return left.every((value, index) => value === right[index]);
  }
  if (typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return String(a).trim() === String(b).trim();
}

/**
 * Compares one source record against one target record.
 * Returns null when the records agree on every compared field.
 */
export function compareRecord(
  source: ComparableRecord,
  target: ComparableRecord,
  options: CompareOptions,
): DetectedConflict | null {
  if (options.unsupportedReason) {
    return {
      resourceCategory: options.resourceCategory,
      conflictType: 'UNSUPPORTED_TARGET_CAPABILITY',
      resourceType: options.resourceType,
      resourceKey: source.key,
      resourceLabel: source.label,
      sourceValue: source.fields,
      targetValue: target.fields,
      diff: [],
      severity: 'LOW',
      explanation: options.unsupportedReason,
    };
  }

  if (options.permissionMissingReason) {
    return {
      resourceCategory: options.resourceCategory,
      conflictType: 'PERMISSION_MISSING',
      resourceType: options.resourceType,
      resourceKey: source.key,
      resourceLabel: source.label,
      sourceValue: source.fields,
      targetValue: target.fields,
      diff: [],
      severity: 'MEDIUM',
      explanation: options.permissionMissingReason,
    };
  }

  const currencyDiffers =
    Boolean(options.sourceCurrency && options.targetCurrency) &&
    options.sourceCurrency !== options.targetCurrency;

  const diff: FieldDiff[] = [];
  let maxSeverity: ConflictSeverity = 'LOW';

  for (const spec of options.fields) {
    const sourceValue = source.fields[spec.field];
    const targetValue = target.fields[spec.field];
    if (valuesEqual(sourceValue, targetValue, spec)) continue;

    // Prices in different currencies are not drift; they are the point.
    const expectedVariance = Boolean(spec.expectedVariance) || (spec.isMoney && currencyDiffers);

    diff.push({
      field: spec.field,
      label: spec.label,
      sourceValue: sourceValue ?? null,
      targetValue: targetValue ?? null,
      isExpectedVariance: Boolean(expectedVariance),
      note:
        spec.isMoney && currencyDiffers
          ? `Source is priced in ${options.sourceCurrency}, target in ${options.targetCurrency}. Amounts are not compared across currencies.`
          : undefined,
    });

    if (!expectedVariance) {
      const severity = spec.severity ?? 'MEDIUM';
      if (rankSeverity(severity) > rankSeverity(maxSeverity)) maxSeverity = severity;
    }
  }

  const realDifferences = diff.filter((entry) => !entry.isExpectedVariance);
  if (realDifferences.length === 0) return null;

  const isOverridden = options.overriddenKeys?.has(source.key) ?? false;
  const isStale = options.staleOverrideKeys?.has(source.key) ?? false;

  const conflictType: ConflictType = isStale
    ? 'SOURCE_CHANGED_AFTER_OVERRIDE'
    : isOverridden
      ? 'LOCAL_OVERRIDE'
      : 'VALUE_MISMATCH';

  return {
    resourceCategory: options.resourceCategory,
    conflictType,
    resourceType: options.resourceType,
    resourceKey: source.key,
    resourceLabel: source.label,
    sourceValue: source.fields,
    targetValue: target.fields,
    diff,
    severity: isOverridden && !isStale ? 'LOW' : maxSeverity,
    explanation: buildExplanation(conflictType, realDifferences, source.label),
  };
}

function buildExplanation(
  conflictType: ConflictType,
  differences: FieldDiff[],
  label: string,
): string {
  const fieldList = differences
    .slice(0, 4)
    .map((entry) => entry.label)
    .join(', ');
  const suffix = differences.length > 4 ? ` and ${differences.length - 4} more` : '';

  switch (conflictType) {
    case 'SOURCE_CHANGED_AFTER_OVERRIDE':
      return `${label} was overridden locally, but the master value has changed since. Differing fields: ${fieldList}${suffix}. Decide whether the local value should stand.`;
    case 'LOCAL_OVERRIDE':
      return `${label} differs from the master because of a deliberate local override on ${fieldList}${suffix}.`;
    default:
      return `${label} differs from the master on ${fieldList}${suffix}, with no override recorded to explain it.`;
  }
}

const SEVERITY_RANK: Record<ConflictSeverity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

function rankSeverity(severity: ConflictSeverity): number {
  return SEVERITY_RANK[severity];
}

/** Records present in the source but absent from the target. */
export function detectMissing(
  sourceRecords: readonly ComparableRecord[],
  matchedKeys: ReadonlySet<string>,
  options: Pick<CompareOptions, 'resourceCategory' | 'resourceType'>,
): DetectedConflict[] {
  return sourceRecords
    .filter((record) => !matchedKeys.has(record.key))
    .map((record) => ({
      resourceCategory: options.resourceCategory,
      conflictType: 'MISSING_IN_TARGET' as const,
      resourceType: options.resourceType,
      resourceKey: record.key,
      resourceLabel: record.label,
      sourceValue: record.fields,
      targetValue: null,
      diff: [],
      severity: 'MEDIUM' as ConflictSeverity,
      explanation: `${record.label} exists in the master store but not in this store.`,
    }));
}

/** Records present in the target but absent from the source. */
export function detectExtra(
  targetRecords: readonly ComparableRecord[],
  matchedKeys: ReadonlySet<string>,
  options: Pick<CompareOptions, 'resourceCategory' | 'resourceType'>,
): DetectedConflict[] {
  return targetRecords
    .filter((record) => !matchedKeys.has(record.key))
    .map((record) => ({
      resourceCategory: options.resourceCategory,
      conflictType: 'EXTRA_IN_TARGET' as const,
      resourceType: options.resourceType,
      resourceKey: record.key,
      resourceLabel: record.label,
      sourceValue: null,
      targetValue: record.fields,
      diff: [],
      severity: 'LOW' as ConflictSeverity,
      explanation: `${record.label} exists in this store but not in the master. It may be a deliberate local product or an orphan.`,
    }));
}

/** The fields compared for a product, and which of them may legitimately vary. */
export const PRODUCT_FIELD_SPECS: FieldSpec[] = [
  { field: 'name', label: 'Product name', severity: 'MEDIUM' },
  { field: 'price', label: 'Price', isMoney: true, severity: 'HIGH' },
  { field: 'salePrice', label: 'Sale price', isMoney: true, severity: 'MEDIUM' },
  { field: 'isVisible', label: 'Visibility', severity: 'HIGH' },
  { field: 'availability', label: 'Availability', severity: 'MEDIUM' },
  { field: 'brandName', label: 'Brand', severity: 'LOW' },
  { field: 'categoryNames', label: 'Categories', severity: 'MEDIUM' },
  { field: 'seoTitle', label: 'SEO title', expectedVariance: true },
  { field: 'seoDescription', label: 'SEO description', expectedVariance: true },
  { field: 'inventoryLevel', label: 'Inventory level', expectedVariance: true },
  { field: 'inventoryTracking', label: 'Inventory tracking', severity: 'LOW' },
  { field: 'productType', label: 'Product type', severity: 'LOW' },
];

export const CONTENT_FIELD_SPECS: FieldSpec[] = [
  { field: 'title', label: 'Title', severity: 'MEDIUM' },
  { field: 'status', label: 'Status', severity: 'HIGH' },
  { field: 'body', label: 'Body', expectedVariance: true },
  { field: 'metaTitle', label: 'Meta title', expectedVariance: true },
];

export const THEME_FIELD_SPECS: FieldSpec[] = [
  { field: 'activeThemeName', label: 'Active theme', severity: 'HIGH' },
  { field: 'activeThemeVersion', label: 'Theme version', severity: 'HIGH' },
  { field: 'hasLocalModifications', label: 'Local modifications', severity: 'MEDIUM' },
];

export const CUSTOMER_GROUP_FIELD_SPECS: FieldSpec[] = [
  { field: 'name', label: 'Group name', severity: 'MEDIUM' },
  { field: 'discountSummary', label: 'Discount', severity: 'HIGH' },
  { field: 'isDefault', label: 'Default group', severity: 'HIGH' },
];
