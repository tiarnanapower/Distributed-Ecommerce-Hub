/**
 * Catalog workspace loader.
 *
 * Builds the cross-store product matrix: for each SKU, the master value, each
 * store's value, whether the difference is an override or unexplained drift,
 * and whether the store has the product at all.
 */
import { prisma } from '@/lib/db';
import { parseJsonLoose } from '@/lib/json';
import { tenantWhere, type TenantScope } from '@/lib/tenancy';

export interface MatrixStore {
  id: string;
  name: string;
  countryCode: string;
  currencyCode: string;
  isMaster: boolean;
  healthStatus: string;
  isDemo: boolean;
}

export interface MatrixCell {
  storeId: string;
  present: boolean;
  price: string | null;
  salePrice: string | null;
  currencyCode: string;
  isVisible: boolean;
  inventoryLevel: number | null;
  isOverridden: boolean;
  /** Fields differing from the master, excluding expected variance. */
  driftFields: string[];
  externalProductId: number | null;
  modifiedAt: Date | null;
}

export interface MatrixRow {
  sku: string;
  name: string;
  brandName: string | null;
  categories: string[];
  masterPrice: string | null;
  masterCurrency: string | null;
  presentIn: number;
  missingIn: number;
  overriddenIn: number;
  divergingIn: number;
  cells: Record<string, MatrixCell>;
  /** Highest-severity issue on this row, for sorting and badge colour. */
  status: 'CONSISTENT' | 'OVERRIDDEN' | 'DIVERGING' | 'MISSING';
}

export interface CatalogMatrix {
  stores: MatrixStore[];
  masterStoreId: string | null;
  masterStoreName: string | null;
  rows: MatrixRow[];
  totals: {
    skus: number;
    consistent: number;
    overridden: number;
    diverging: number;
    missing: number;
  };
}

/** Fields that legitimately differ per market and are never counted as drift. */
const EXPECTED_VARIANCE_FIELDS = new Set(['price', 'salePrice', 'inventoryLevel', 'seoTitle', 'seoDescription']);

export async function loadCatalogMatrix(
  scope: TenantScope,
  options: { storeIds?: string[]; limit?: number } = {},
): Promise<CatalogMatrix> {
  const connections = await prisma.storeConnection.findMany({
    where: {
      ...tenantWhere(scope),
      deletedAt: null,
      ...(options.storeIds && options.storeIds.length > 0 ? { id: { in: options.storeIds } } : {}),
    },
    orderBy: [{ hierarchyMode: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      countryCode: true,
      currencyCode: true,
      hierarchyMode: true,
      healthStatus: true,
      isDemo: true,
    },
  });

  const stores: MatrixStore[] = connections.map((connection) => ({
    id: connection.id,
    name: connection.name,
    countryCode: connection.countryCode,
    currencyCode: connection.currencyCode,
    isMaster: connection.hierarchyMode === 'MASTER',
    healthStatus: connection.healthStatus,
    isDemo: connection.isDemo,
  }));

  const master = stores.find((store) => store.isMaster) ?? stores[0] ?? null;

  const [products, overrides] = await Promise.all([
    prisma.productSnapshot.findMany({
      where: { organisationId: scope.organisationId, connectionId: { in: stores.map((s) => s.id) } },
      select: {
        connectionId: true,
        externalProductId: true,
        sku: true,
        name: true,
        brandName: true,
        price: true,
        salePrice: true,
        currencyCode: true,
        isVisible: true,
        inventoryLevel: true,
        categoriesJson: true,
        externalModifiedAt: true,
      },
    }),
    prisma.resourceOverride.findMany({
      where: {
        organisationId: scope.organisationId,
        connectionId: { in: stores.map((s) => s.id) },
        resourceCategory: { in: ['PRODUCTS', 'PRICING'] },
        status: 'ACTIVE',
      },
      select: { connectionId: true, resourceKey: true },
    }),
  ]);

  const overrideKeys = new Set(
    overrides.map((override) => `${override.connectionId}|${override.resourceKey}`),
  );

  // Group by SKU — the only identity that travels between independent stores.
  const bySku = new Map<string, typeof products>();
  for (const product of products) {
    bySku.set(product.sku, [...(bySku.get(product.sku) ?? []), product]);
  }

  const rows: MatrixRow[] = [];

  for (const [sku, entries] of bySku) {
    const masterEntry = master ? entries.find((entry) => entry.connectionId === master.id) : undefined;
    const reference = masterEntry ?? entries[0]!;

    const cells: Record<string, MatrixCell> = {};
    let overriddenIn = 0;
    let divergingIn = 0;

    for (const store of stores) {
      const entry = entries.find((candidate) => candidate.connectionId === store.id);
      if (!entry) {
        cells[store.id] = {
          storeId: store.id,
          present: false,
          price: null,
          salePrice: null,
          currencyCode: store.currencyCode,
          isVisible: false,
          inventoryLevel: null,
          isOverridden: false,
          driftFields: [],
          externalProductId: null,
          modifiedAt: null,
        };
        continue;
      }

      const isOverridden = overrideKeys.has(`${store.id}|${sku}`);
      const driftFields: string[] = [];

      if (masterEntry && entry.connectionId !== masterEntry.connectionId) {
        if (entry.name !== masterEntry.name) driftFields.push('name');
        if (entry.isVisible !== masterEntry.isVisible) driftFields.push('isVisible');
        if (entry.brandName !== masterEntry.brandName) driftFields.push('brandName');
        // Price only counts as drift within the same currency; across
        // currencies a different amount is the whole point.
        if (
          entry.currencyCode === masterEntry.currencyCode &&
          Number(entry.price) !== Number(masterEntry.price)
        ) {
          driftFields.push('price');
        }
      }

      const unexplainedDrift = driftFields.filter((field) => !EXPECTED_VARIANCE_FIELDS.has(field));
      if (isOverridden) overriddenIn += 1;
      else if (unexplainedDrift.length > 0) divergingIn += 1;

      cells[store.id] = {
        storeId: store.id,
        present: true,
        price: entry.price,
        salePrice: entry.salePrice,
        currencyCode: entry.currencyCode,
        isVisible: entry.isVisible,
        inventoryLevel: entry.inventoryLevel,
        isOverridden,
        driftFields,
        externalProductId: entry.externalProductId,
        modifiedAt: entry.externalModifiedAt,
      };
    }

    const presentIn = Object.values(cells).filter((cell) => cell.present).length;
    const missingIn = stores.length - presentIn;

    rows.push({
      sku,
      name: reference.name,
      brandName: reference.brandName,
      categories: parseJsonLoose<{ name: string }[]>(reference.categoriesJson, []).map((c) => c.name),
      masterPrice: masterEntry?.price ?? null,
      masterCurrency: masterEntry?.currencyCode ?? null,
      presentIn,
      missingIn,
      overriddenIn,
      divergingIn,
      cells,
      status:
        missingIn > 0 ? 'MISSING' : divergingIn > 0 ? 'DIVERGING' : overriddenIn > 0 ? 'OVERRIDDEN' : 'CONSISTENT',
    });
  }

  rows.sort((a, b) => {
    const rank = { MISSING: 0, DIVERGING: 1, OVERRIDDEN: 2, CONSISTENT: 3 };
    const delta = rank[a.status] - rank[b.status];
    return delta !== 0 ? delta : a.sku.localeCompare(b.sku);
  });

  const limited = options.limit ? rows.slice(0, options.limit) : rows;

  return {
    stores,
    masterStoreId: master?.id ?? null,
    masterStoreName: master?.name ?? null,
    rows: limited,
    totals: {
      skus: rows.length,
      consistent: rows.filter((row) => row.status === 'CONSISTENT').length,
      overridden: rows.filter((row) => row.status === 'OVERRIDDEN').length,
      diverging: rows.filter((row) => row.status === 'DIVERGING').length,
      missing: rows.filter((row) => row.status === 'MISSING').length,
    },
  };
}

export async function loadProductDetail(scope: TenantScope, sku: string) {
  const snapshots = await prisma.productSnapshot.findMany({
    where: { organisationId: scope.organisationId, sku },
    include: {
      connection: {
        select: {
          id: true,
          name: true,
          countryCode: true,
          currencyCode: true,
          hierarchyMode: true,
          healthStatus: true,
          isDemo: true,
        },
      },
    },
    orderBy: { connection: { name: 'asc' } },
  });

  const [overrides, mappings, conflicts] = await Promise.all([
    prisma.resourceOverride.findMany({
      where: { organisationId: scope.organisationId, resourceKey: sku, status: 'ACTIVE' },
      include: { connection: { select: { name: true } }, setBy: { select: { name: true } } },
    }),
    prisma.productMapping.findMany({
      where: { organisationId: scope.organisationId, masterSku: sku },
      include: {
        master: { select: { name: true } },
        target: { select: { id: true, name: true } },
      },
    }),
    prisma.conflict.findMany({
      where: { organisationId: scope.organisationId, resourceKey: sku },
      include: { target: { select: { id: true, name: true } } },
      orderBy: { detectedAt: 'desc' },
    }),
  ]);

  return { snapshots, overrides, mappings, conflicts };
}
