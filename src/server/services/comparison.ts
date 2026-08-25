/**
 * Comparison and drift detection service.
 *
 * Compares a source store against target stores across resource categories,
 * turning field-level differences into persisted `Conflict` rows. Re-running a
 * scan is idempotent: conflicts are keyed on
 * (target, category, resourceKey, conflictType), so a repeat scan updates
 * `lastSeenAt` rather than duplicating, and conflicts that no longer reproduce
 * are auto-resolved.
 */
import { prisma } from '@/lib/db';
import { stringifyJson } from '@/lib/json';
import { logger } from '@/lib/logger';
import {
  CONTENT_FIELD_SPECS,
  CUSTOMER_GROUP_FIELD_SPECS,
  PRODUCT_FIELD_SPECS,
  THEME_FIELD_SPECS,
  compareRecord,
  detectExtra,
  detectMissing,
  type ComparableRecord,
  type DetectedConflict,
  type FieldSpec,
} from '@/lib/comparison/diff';
import { mapProducts, type MappableProduct } from '@/lib/comparison/mapping';
import type { ResourceCategory } from '@/lib/resource-categories';

export interface ComparisonScanInput {
  organisationId: string;
  sourceConnectionId: string;
  targetConnectionIds: string[];
  categories: string[];
  correlationId?: string;
  onProgress?: (percent: number) => Promise<void> | void;
  checkCancelled?: () => Promise<void>;
}

export interface ComparisonScanResult {
  storesCompared: number;
  storesFailed: number;
  storesSkipped: number;
  conflictsOpened: number;
  conflictsReconfirmed: number;
  conflictsResolved: number;
  byCategory: Record<string, number>;
}

export async function runComparisonScan(
  input: ComparisonScanInput,
): Promise<ComparisonScanResult> {
  const result: ComparisonScanResult = {
    storesCompared: 0,
    storesFailed: 0,
    storesSkipped: 0,
    conflictsOpened: 0,
    conflictsReconfirmed: 0,
    conflictsResolved: 0,
    byCategory: {},
  };

  const source = await prisma.storeConnection.findUnique({
    where: { id: input.sourceConnectionId },
    select: { id: true, name: true, currencyCode: true, organisationId: true },
  });
  if (!source || source.organisationId !== input.organisationId) {
    result.storesFailed = input.targetConnectionIds.length;
    return result;
  }

  const targets = await prisma.storeConnection.findMany({
    where: {
      id: { in: input.targetConnectionIds },
      organisationId: input.organisationId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      currencyCode: true,
      healthStatus: true,
      capabilities: { select: { capabilityKey: true, status: true, unavailableReason: true } },
      overrides: { select: { resourceCategory: true, resourceKey: true, sourceChangedAt: true } },
    },
  });

  const seenConflictKeys = new Set<string>();

  for (const [index, target] of targets.entries()) {
    await input.checkCancelled?.();

    if (target.id === source.id) {
      result.storesSkipped += 1;
      continue;
    }

    try {
      for (const rawCategory of input.categories) {
        const category = rawCategory as ResourceCategory;
        const detected = await compareCategory(category, source, target);

        for (const conflict of detected) {
          const key = `${target.id}|${conflict.resourceCategory}|${conflict.resourceKey}|${conflict.conflictType}`;
          seenConflictKeys.add(key);

          const existing = await prisma.conflict.findUnique({
            where: {
              targetConnectionId_resourceCategory_resourceKey_conflictType: {
                targetConnectionId: target.id,
                resourceCategory: conflict.resourceCategory,
                resourceKey: conflict.resourceKey,
                conflictType: conflict.conflictType,
              },
            },
            select: { id: true, status: true },
          });

          if (existing) {
            // Never reopen something an operator deliberately closed.
            if (existing.status === 'ACCEPTED_VARIANCE' || existing.status === 'EXCLUDED') {
              continue;
            }
            await prisma.conflict.update({
              where: { id: existing.id },
              data: {
                lastSeenAt: new Date(),
                sourceValueJson: stringifyJson(conflict.sourceValue),
                targetValueJson: stringifyJson(conflict.targetValue),
                diffJson: stringifyJson(conflict.diff),
                severity: conflict.severity,
                status: existing.status === 'RESOLVED' ? 'OPEN' : existing.status,
                resolvedAt: existing.status === 'RESOLVED' ? null : undefined,
              },
            });
            result.conflictsReconfirmed += 1;
          } else {
            await prisma.conflict.create({
              data: {
                organisationId: input.organisationId,
                resourceCategory: conflict.resourceCategory,
                conflictType: conflict.conflictType,
                sourceConnectionId: source.id,
                targetConnectionId: target.id,
                resourceType: conflict.resourceType,
                resourceKey: conflict.resourceKey,
                resourceLabel: conflict.resourceLabel,
                sourceValueJson: stringifyJson(conflict.sourceValue),
                targetValueJson: stringifyJson(conflict.targetValue),
                diffJson: stringifyJson(conflict.diff),
                severity: conflict.severity,
                status: 'OPEN',
              },
            });
            result.conflictsOpened += 1;
          }

          result.byCategory[conflict.resourceCategory] =
            (result.byCategory[conflict.resourceCategory] ?? 0) + 1;
        }
      }

      result.storesCompared += 1;
    } catch (error) {
      result.storesFailed += 1;
      logger.warn('Comparison failed for one store', {
        connectionId: target.id,
        correlationId: input.correlationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await input.onProgress?.(((index + 1) / Math.max(1, targets.length)) * 100);
  }

  // Anything previously open that no longer reproduces has been fixed.
  const stale = await prisma.conflict.findMany({
    where: {
      organisationId: input.organisationId,
      targetConnectionId: { in: targets.map((target) => target.id) },
      resourceCategory: { in: input.categories },
      status: { in: ['OPEN', 'ACKNOWLEDGED'] },
    },
    select: { id: true, targetConnectionId: true, resourceCategory: true, resourceKey: true, conflictType: true },
  });

  for (const conflict of stale) {
    const key = `${conflict.targetConnectionId}|${conflict.resourceCategory}|${conflict.resourceKey}|${conflict.conflictType}`;
    if (seenConflictKeys.has(key)) continue;
    await prisma.conflict.update({
      where: { id: conflict.id },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
    result.conflictsResolved += 1;
  }

  return result;
}

interface StoreLite {
  id: string;
  name: string;
  currencyCode: string;
}

interface TargetLite extends StoreLite {
  capabilities: { capabilityKey: string; status: string; unavailableReason: string | null }[];
  overrides: { resourceCategory: string; resourceKey: string; sourceChangedAt: Date | null }[];
}

async function compareCategory(
  category: ResourceCategory,
  source: StoreLite,
  target: TargetLite,
): Promise<DetectedConflict[]> {
  const overriddenKeys = new Set(
    target.overrides
      .filter((override) => override.resourceCategory === category)
      .map((override) => override.resourceKey),
  );
  const staleOverrideKeys = new Set(
    target.overrides
      .filter((override) => override.resourceCategory === category && override.sourceChangedAt)
      .map((override) => override.resourceKey),
  );

  const capabilityKey = READ_CAPABILITY_BY_CATEGORY[category];
  const capability = capabilityKey
    ? target.capabilities.find((entry) => entry.capabilityKey === capabilityKey)
    : undefined;

  const permissionMissingReason =
    capability?.status === 'PERMISSION_MISSING'
      ? (capability.unavailableReason ??
        'The API account for this store is missing the scope needed to read this resource.')
      : null;

  const unsupportedReason =
    capability?.status === 'NOT_SUPPORTED' ? capability.unavailableReason : null;

  switch (category) {
    case 'PRODUCTS':
    case 'PRICING':
      return compareProducts(source, target, {
        overriddenKeys,
        staleOverrideKeys,
        permissionMissingReason,
        unsupportedReason,
        category,
        fields: category === 'PRICING' ? PRICING_FIELD_SPECS : PRODUCT_FIELD_SPECS,
      });
    case 'THEMES':
      return compareThemes(source, target, { overriddenKeys, staleOverrideKeys });
    case 'CUSTOMER_GROUPS':
      return compareCustomerGroups(source, target, { overriddenKeys, staleOverrideKeys });
    case 'PAGES':
      return compareContent(source, target, { overriddenKeys, staleOverrideKeys });
    default:
      return [];
  }
}

const READ_CAPABILITY_BY_CATEGORY: Partial<Record<ResourceCategory, string>> = {
  PRODUCTS: 'products.read',
  PRICING: 'products.read',
  CATEGORIES: 'categories.read',
  BRANDS: 'brands.read',
  PRICE_LISTS: 'price_lists.read',
  CUSTOMER_GROUPS: 'customer_groups.read',
  PAGES: 'pages.read',
  WIDGETS: 'widgets.read',
  REDIRECTS: 'redirects.read',
  SCRIPTS: 'scripts.read',
  THEMES: 'themes.read',
  PROMOTIONS: 'promotions.read',
};

const PRICING_FIELD_SPECS: FieldSpec[] = [
  { field: 'price', label: 'Price', isMoney: true, severity: 'HIGH' },
  { field: 'salePrice', label: 'Sale price', isMoney: true, severity: 'MEDIUM' },
  { field: 'retailPrice', label: 'Retail price', isMoney: true, severity: 'LOW' },
  { field: 'costPrice', label: 'Cost price', isMoney: true, severity: 'LOW' },
];

async function compareProducts(
  source: StoreLite,
  target: TargetLite,
  options: {
    overriddenKeys: Set<string>;
    staleOverrideKeys: Set<string>;
    permissionMissingReason: string | null;
    unsupportedReason: string | null;
    category: ResourceCategory;
    fields: FieldSpec[];
  },
): Promise<DetectedConflict[]> {
  const [sourceProducts, targetProducts] = await Promise.all([
    prisma.productSnapshot.findMany({ where: { connectionId: source.id } }),
    prisma.productSnapshot.findMany({ where: { connectionId: target.id } }),
  ]);

  if (sourceProducts.length === 0) return [];

  const toMappable = (row: (typeof sourceProducts)[number]): MappableProduct => ({
    externalId: row.externalProductId,
    sku: row.sku,
    name: row.name,
  });

  const { matches, extraInTarget } = mapProducts(
    sourceProducts.map(toMappable),
    targetProducts.map(toMappable),
  );

  const targetById = new Map(targetProducts.map((row) => [row.externalProductId, row]));
  const sourceBySku = new Map(sourceProducts.map((row) => [row.sku, row]));

  const conflicts: DetectedConflict[] = [];
  const matchedSourceKeys = new Set<string>();

  for (const match of matches) {
    const sourceRow = sourceBySku.get(match.masterSku);
    if (!sourceRow) continue;

    if (match.status === 'MISSING_IN_TARGET') continue; // handled below
    if (match.status === 'AMBIGUOUS') {
      conflicts.push({
        resourceCategory: options.category,
        conflictType: 'INVALID_MAPPING',
        resourceType: 'product',
        resourceKey: match.masterSku,
        resourceLabel: sourceRow.name,
        sourceValue: { sku: match.masterSku },
        targetValue: null,
        diff: [],
        severity: 'MEDIUM',
        explanation:
          match.reviewReason ?? 'This product could not be matched unambiguously in the target store.',
      });
      matchedSourceKeys.add(match.masterSku);
      continue;
    }

    const targetRow = match.targetProductId ? targetById.get(match.targetProductId) : undefined;
    if (!targetRow) continue;
    matchedSourceKeys.add(match.masterSku);

    const conflict = compareRecord(
      productRecord(sourceRow),
      productRecord(targetRow),
      {
        resourceCategory: options.category,
        resourceType: 'product',
        fields: options.fields,
        overriddenKeys: options.overriddenKeys,
        staleOverrideKeys: options.staleOverrideKeys,
        permissionMissingReason: options.permissionMissingReason,
        unsupportedReason: options.unsupportedReason,
        sourceCurrency: source.currencyCode,
        targetCurrency: target.currencyCode,
      },
    );
    if (conflict) conflicts.push(conflict);
  }

  conflicts.push(
    ...detectMissing(sourceProducts.map(productRecord), matchedSourceKeys, {
      resourceCategory: options.category,
      resourceType: 'product',
    }),
  );

  const extraKeys = new Set(extraInTarget.map((product) => product.sku));
  conflicts.push(
    ...detectExtra(
      targetProducts.filter((row) => extraKeys.has(row.sku)).map(productRecord),
      new Set(),
      { resourceCategory: options.category, resourceType: 'product' },
    ),
  );

  return conflicts;
}

function productRecord(row: {
  sku: string;
  name: string;
  price: string;
  salePrice: string | null;
  retailPrice: string | null;
  costPrice: string | null;
  isVisible: boolean;
  availability: string;
  brandName: string | null;
  categoriesJson: string;
  seoTitle: string | null;
  seoDescription: string | null;
  inventoryLevel: number | null;
  inventoryTracking: string;
  productType: string;
}): ComparableRecord {
  let categoryNames: string[] = [];
  try {
    categoryNames = (JSON.parse(row.categoriesJson) as { name: string }[]).map(
      (category) => category.name,
    );
  } catch {
    categoryNames = [];
  }

  return {
    key: row.sku,
    label: row.name,
    fields: {
      name: row.name,
      price: row.price,
      salePrice: row.salePrice,
      retailPrice: row.retailPrice,
      costPrice: row.costPrice,
      isVisible: row.isVisible,
      availability: row.availability,
      brandName: row.brandName,
      categoryNames,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      inventoryLevel: row.inventoryLevel,
      inventoryTracking: row.inventoryTracking,
      productType: row.productType,
    },
  };
}

async function compareThemes(
  source: StoreLite,
  target: TargetLite,
  options: { overriddenKeys: Set<string>; staleOverrideKeys: Set<string> },
): Promise<DetectedConflict[]> {
  const [sourceAssignment, targetAssignment] = await Promise.all([
    prisma.themeAssignment.findFirst({ where: { connectionId: source.id, channelId: null } }),
    prisma.themeAssignment.findFirst({ where: { connectionId: target.id, channelId: null } }),
  ]);

  if (!sourceAssignment || !targetAssignment) return [];

  const toRecord = (assignment: NonNullable<typeof sourceAssignment>): ComparableRecord => ({
    key: 'active-theme',
    label: 'Active storefront theme',
    fields: {
      activeThemeName: assignment.activeThemeName,
      activeThemeVersion: assignment.activeThemeVersion,
      hasLocalModifications: assignment.hasLocalModifications,
    },
  });

  const conflict = compareRecord(toRecord(sourceAssignment), toRecord(targetAssignment), {
    resourceCategory: 'THEMES',
    resourceType: 'theme',
    fields: THEME_FIELD_SPECS,
    overriddenKeys: options.overriddenKeys,
    staleOverrideKeys: options.staleOverrideKeys,
  });

  return conflict ? [conflict] : [];
}

async function compareCustomerGroups(
  source: StoreLite,
  target: TargetLite,
  options: { overriddenKeys: Set<string>; staleOverrideKeys: Set<string> },
): Promise<DetectedConflict[]> {
  const [sourceGroups, targetGroups] = await Promise.all([
    prisma.customerGroupMapping.findMany({ where: { connectionId: source.id } }),
    prisma.customerGroupMapping.findMany({ where: { connectionId: target.id } }),
  ]);

  const targetByName = new Map(
    targetGroups.map((group) => [group.externalGroupName.toLowerCase(), group]),
  );
  const conflicts: DetectedConflict[] = [];
  const matched = new Set<string>();

  for (const group of sourceGroups) {
    const match = targetByName.get(group.externalGroupName.toLowerCase());
    if (!match) {
      conflicts.push({
        resourceCategory: 'CUSTOMER_GROUPS',
        conflictType: 'MISSING_IN_TARGET',
        resourceType: 'customer_group',
        resourceKey: group.externalGroupName,
        resourceLabel: group.externalGroupName,
        sourceValue: { name: group.externalGroupName, discountSummary: group.discountSummary },
        targetValue: null,
        diff: [],
        severity: 'MEDIUM',
        explanation: `The customer group “${group.externalGroupName}” exists in ${source.name} but not in ${target.name}. Creating it will produce a new store-local id.`,
      });
      continue;
    }

    matched.add(match.externalGroupName.toLowerCase());

    const conflict = compareRecord(
      {
        key: group.externalGroupName,
        label: group.externalGroupName,
        fields: {
          name: group.externalGroupName,
          discountSummary: group.discountSummary,
          isDefault: false,
        },
      },
      {
        key: match.externalGroupName,
        label: match.externalGroupName,
        fields: {
          name: match.externalGroupName,
          discountSummary: match.discountSummary,
          isDefault: false,
        },
      },
      {
        resourceCategory: 'CUSTOMER_GROUPS',
        resourceType: 'customer_group',
        fields: CUSTOMER_GROUP_FIELD_SPECS,
        overriddenKeys: options.overriddenKeys,
        staleOverrideKeys: options.staleOverrideKeys,
      },
    );
    if (conflict) conflicts.push(conflict);
  }

  return conflicts;
}

async function compareContent(
  source: StoreLite,
  target: TargetLite,
  options: { overriddenKeys: Set<string>; staleOverrideKeys: Set<string> },
): Promise<DetectedConflict[]> {
  const [sourcePages, targetPages] = await Promise.all([
    prisma.contentSnapshot.findMany({ where: { connectionId: source.id, contentType: 'PAGE' } }),
    prisma.contentSnapshot.findMany({ where: { connectionId: target.id, contentType: 'PAGE' } }),
  ]);

  const targetByKey = new Map(targetPages.map((page) => [page.contentKey, page]));
  const conflicts: DetectedConflict[] = [];
  const matched = new Set<string>();

  for (const page of sourcePages) {
    const match = targetByKey.get(page.contentKey);
    if (!match) continue;
    matched.add(page.contentKey);

    const conflict = compareRecord(
      { key: page.contentKey, label: page.title, fields: { title: page.title, status: page.status } },
      { key: match.contentKey, label: match.title, fields: { title: match.title, status: match.status } },
      {
        resourceCategory: 'PAGES',
        resourceType: 'page',
        fields: CONTENT_FIELD_SPECS,
        overriddenKeys: options.overriddenKeys,
        staleOverrideKeys: options.staleOverrideKeys,
      },
    );
    if (conflict) conflicts.push(conflict);
  }

  conflicts.push(
    ...detectMissing(
      sourcePages.map((page) => ({
        key: page.contentKey,
        label: page.title,
        fields: { title: page.title, status: page.status },
      })),
      matched,
      { resourceCategory: 'PAGES', resourceType: 'page' },
    ),
  );

  return conflicts;
}
