/**
 * Cross-store identity mapping.
 *
 * BigCommerce ids are store-local. A product with id 112 in the UK master store
 * has no relationship whatsoever to product 112 in the German store. Every
 * cross-store operation therefore resolves identity through an explicit
 * mapping, built here from SKU (and, where that fails, name similarity, flagged
 * as low confidence for a human to confirm).
 *
 * Pure functions — the persistence side lives in the comparison service.
 */
import type { MappingStatus, MatchStrategy } from '@/lib/enums';

export interface MappableProduct {
  externalId: number;
  sku: string;
  name: string;
}

export interface ProductMatch {
  masterProductId: number;
  masterSku: string;
  targetProductId: number | null;
  targetSku: string | null;
  status: MappingStatus;
  strategy: MatchStrategy;
  confidence: number;
  /** Set when a human should confirm the match. */
  reviewReason?: string;
}

function normaliseSku(sku: string): string {
  return sku.trim().toUpperCase().replace(/[\s_]+/g, '-');
}

function normaliseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Builds the master→target product mapping.
 *
 * SKU is the only strategy trusted at full confidence. Name matches are
 * returned as `MANUAL` with a low confidence score so they never drive an
 * automatic write.
 */
export function mapProducts(
  master: readonly MappableProduct[],
  target: readonly MappableProduct[],
  options: { allowNameFallback?: boolean } = {},
): { matches: ProductMatch[]; extraInTarget: MappableProduct[] } {
  const allowNameFallback = options.allowNameFallback ?? true;

  const targetBySku = new Map<string, MappableProduct[]>();
  const targetByName = new Map<string, MappableProduct[]>();

  for (const product of target) {
    if (product.sku) {
      const key = normaliseSku(product.sku);
      targetBySku.set(key, [...(targetBySku.get(key) ?? []), product]);
    }
    const nameKey = normaliseName(product.name);
    targetByName.set(nameKey, [...(targetByName.get(nameKey) ?? []), product]);
  }

  const consumed = new Set<number>();
  const matches: ProductMatch[] = [];

  for (const source of master) {
    const base = { masterProductId: source.externalId, masterSku: source.sku };

    if (!source.sku) {
      matches.push({
        ...base,
        targetProductId: null,
        targetSku: null,
        status: 'AMBIGUOUS',
        strategy: 'MANUAL',
        confidence: 0,
        reviewReason: 'The source product has no SKU, so it cannot be matched automatically.',
      });
      continue;
    }

    const skuKey = normaliseSku(source.sku);
    const skuCandidates = targetBySku.get(skuKey) ?? [];

    if (skuCandidates.length === 1) {
      const match = skuCandidates[0]!;
      consumed.add(match.externalId);
      matches.push({
        ...base,
        targetProductId: match.externalId,
        targetSku: match.sku,
        status: 'MAPPED',
        strategy: 'SKU',
        confidence: 1,
      });
      continue;
    }

    if (skuCandidates.length > 1) {
      // Duplicate SKUs in the target: never guess which one is meant.
      for (const candidate of skuCandidates) consumed.add(candidate.externalId);
      matches.push({
        ...base,
        targetProductId: null,
        targetSku: null,
        status: 'AMBIGUOUS',
        strategy: 'MANUAL',
        confidence: 0,
        reviewReason: `The target store has ${skuCandidates.length} products with SKU ${source.sku}. Pick the right one before deploying.`,
      });
      continue;
    }

    if (allowNameFallback) {
      const nameCandidates = targetByName.get(normaliseName(source.name)) ?? [];
      const unconsumed = nameCandidates.filter((candidate) => !consumed.has(candidate.externalId));
      if (unconsumed.length === 1) {
        const match = unconsumed[0]!;
        consumed.add(match.externalId);
        matches.push({
          ...base,
          targetProductId: match.externalId,
          targetSku: match.sku,
          status: 'MANUAL',
          strategy: 'NAME',
          confidence: 0.5,
          reviewReason: `Matched on product name because SKU ${source.sku} does not exist in the target. Confirm before deploying.`,
        });
        continue;
      }
    }

    matches.push({
      ...base,
      targetProductId: null,
      targetSku: null,
      status: 'MISSING_IN_TARGET',
      strategy: 'SKU',
      confidence: 1,
    });
  }

  const extraInTarget = target.filter((product) => !consumed.has(product.externalId));
  return { matches, extraInTarget };
}

// ---------------------------------------------------------------------------
// Customer groups
// ---------------------------------------------------------------------------

export interface MappableCustomerGroup {
  externalId: number | null;
  name: string;
  discountSummary?: string | null;
}

export interface CustomerGroupMatch {
  templateName: string;
  targetGroupId: number | null;
  targetGroupName: string | null;
  status: 'MAPPED' | 'MISSING_IN_TARGET' | 'NAME_CONFLICT';
  note?: string;
}

/**
 * Matches a template's group structure against one store.
 *
 * Names are matched case-insensitively because that is all BigCommerce gives us
 * to work with — numeric ids are never assumed to be portable. A near-miss
 * (same name, different case or spacing) is reported as a NAME_CONFLICT so it
 * is resolved deliberately rather than creating a duplicate group.
 */
export function mapCustomerGroups(
  templateNames: readonly string[],
  targetGroups: readonly MappableCustomerGroup[],
): CustomerGroupMatch[] {
  const exact = new Map(targetGroups.map((group) => [group.name, group]));
  const loose = new Map(
    targetGroups.map((group) => [group.name.trim().toLowerCase().replace(/\s+/g, ' '), group]),
  );

  return templateNames.map((templateName) => {
    const exactMatch = exact.get(templateName);
    if (exactMatch) {
      return {
        templateName,
        targetGroupId: exactMatch.externalId,
        targetGroupName: exactMatch.name,
        status: 'MAPPED' as const,
      };
    }

    const looseKey = templateName.trim().toLowerCase().replace(/\s+/g, ' ');
    const looseMatch = loose.get(looseKey);
    if (looseMatch) {
      return {
        templateName,
        targetGroupId: looseMatch.externalId,
        targetGroupName: looseMatch.name,
        status: 'NAME_CONFLICT' as const,
        note: `The target store has "${looseMatch.name}", which differs only in case or spacing from "${templateName}". Resolve this before deploying so a duplicate group is not created.`,
      };
    }

    return {
      templateName,
      targetGroupId: null,
      targetGroupName: null,
      status: 'MISSING_IN_TARGET' as const,
      note: 'Creating this group in the target store will produce a new numeric id, which is recorded in the mapping.',
    };
  });
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export interface MappableCategory {
  externalId: number;
  path: string;
}

export function mapCategories(
  master: readonly MappableCategory[],
  target: readonly MappableCategory[],
): {
  matches: {
    masterCategoryId: number;
    masterPath: string;
    targetCategoryId: number | null;
    targetPath: string | null;
    status: MappingStatus;
  }[];
  extraInTarget: MappableCategory[];
} {
  const normalise = (path: string) => path.trim().toLowerCase().replace(/\s*\/\s*/g, '/');
  const byPath = new Map(target.map((category) => [normalise(category.path), category]));
  const consumed = new Set<number>();

  const matches = master.map((source) => {
    const match = byPath.get(normalise(source.path));
    if (match) consumed.add(match.externalId);
    return {
      masterCategoryId: source.externalId,
      masterPath: source.path,
      targetCategoryId: match?.externalId ?? null,
      targetPath: match?.path ?? null,
      status: (match ? 'MAPPED' : 'MISSING_IN_TARGET') as MappingStatus,
    };
  });

  return {
    matches,
    extraInTarget: target.filter((category) => !consumed.has(category.externalId)),
  };
}
