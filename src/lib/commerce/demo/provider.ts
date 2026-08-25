/**
 * Demo provider.
 *
 * Serves the seeded snapshot tables so the whole application is usable without
 * a single BigCommerce credential. It makes no network calls, ever, and every
 * value it returns is flagged `isSimulated: true` so the UI can label it.
 *
 * Destructive operations are impossible here by construction: like the
 * BigCommerce provider, this class has no write methods at all.
 */
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { parseJsonLoose } from '@/lib/json';
import {
  CAPABILITY_LIST,
  resolveCapabilityStatus,
} from '@/lib/commerce/capability-registry';
import type {
  Brand,
  CapabilityProbeResult,
  Category,
  Channel,
  CommerceProvider,
  ConnectionResult,
  Customer,
  CustomerGroup,
  CustomerQuery,
  InventoryItem,
  InventoryLocation,
  Order,
  OrderQuery,
  Page,
  Paginated,
  PriceList,
  PriceRecord,
  Product,
  ProductQuery,
  Promotion,
  Redirect,
  StoreInfo,
  StorefrontScript,
  Theme,
  Widget,
} from '@/lib/commerce/types';

export class DemoCommerceProvider implements CommerceProvider {
  readonly kind = 'demo' as const;
  readonly isSimulated = true;
  readonly connectionId: string;

  constructor(connectionId: string) {
    this.connectionId = connectionId;
  }

  private async connection() {
    const record = await prisma.storeConnection.findUnique({
      where: { id: this.connectionId },
      include: { channels: true },
    });
    if (!record) {
      throw new AppError('NOT_FOUND', 'That store could not be found.');
    }
    return record;
  }

  async testConnection(): Promise<ConnectionResult> {
    const connection = await this.connection();
    const unhealthy = connection.healthStatus === 'CRITICAL';
    return {
      ok: !unhealthy,
      latencyMs: 40 + (connection.name.length % 60),
      grantedScopes: unhealthy
        ? ['store_v2_information_read_only']
        : [
            'store_v2_information_read_only',
            'store_v2_products_read_only',
            'store_v2_orders_read_only',
            'store_v2_customers_read_only',
            'store_v2_content_read_only',
            'store_channel_settings_read_only',
            'store_themes_read_only',
          ],
      missingScopes: unhealthy
        ? ['store_v2_products_read_only', 'store_v2_orders_read_only']
        : [],
      storeName: connection.name,
      storeHash: connection.storeHash ?? undefined,
      message: unhealthy
        ? connection.lastErrorSummary ??
          'Demo mode: this store is seeded as unhealthy so the failure paths can be exercised.'
        : 'Demo mode: no BigCommerce store was contacted. This result is generated from seed data.',
      errorCode: unhealthy ? 'CREDENTIAL_INVALID' : undefined,
      checkedAt: new Date(),
      isSimulated: true,
    };
  }

  async getStoreInfo(): Promise<StoreInfo> {
    const connection = await this.connection();
    return {
      storeHash: connection.storeHash ?? 'demo0000',
      name: connection.name,
      domain: connection.primaryDomain,
      secureUrl: connection.primaryDomain ? `https://${connection.primaryDomain}` : null,
      controlPanelUrl: connection.controlPanelUrl,
      status: connection.status === 'ACTIVE' ? 'live' : connection.status.toLowerCase(),
      currencyCode: connection.currencyCode,
      currencySymbol: null,
      weightUnits: connection.countryCode === 'US' ? 'LBS' : 'KGS',
      timezoneName: connection.timezone,
      language: connection.locale,
      countryCode: connection.countryCode,
      planName: connection.platformPlan,
      planLevel: connection.platformPlan,
      multiStorefrontEnabled: connection.msfEnabled,
      storefrontLimit: connection.storefrontLimit,
      features: {
        stencil: true,
        sitewideHttps: true,
        checkoutType: 'optimized',
        graphqlStorefrontApi: true,
        activeStorefronts: connection.storefrontsUsed,
        planIsTrial: false,
      },
      isSimulated: true,
    };
  }

  async listChannels(): Promise<Channel[]> {
    const channels = await prisma.storefrontChannel.findMany({
      where: { connectionId: this.connectionId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    return channels.map((channel) => ({
      id: channel.externalChannelId ?? 0,
      name: channel.name,
      platform: channel.platform,
      type: channel.channelType,
      status: channel.status,
      isListableFromUi: channel.isListableFromUI,
      isVisible: channel.status === 'active',
      externalId: null,
      siteUrl: channel.siteUrl,
      siteId: channel.externalSiteId,
      currencyCode: channel.currencyCode,
      locale: channel.locale,
      createdAt: channel.createdAt,
      updatedAt: channel.updatedAt,
    }));
  }

  async listProducts(params: ProductQuery): Promise<Paginated<Product>> {
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 50, 250);

    const where = {
      connectionId: this.connectionId,
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search } },
              { sku: { contains: params.search } },
            ],
          }
        : {}),
      ...(params.sku ? { sku: params.sku } : {}),
      ...(params.isVisible !== undefined ? { isVisible: params.isVisible } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.productSnapshot.findMany({
        where,
        orderBy: { sku: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.productSnapshot.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.mapProduct(row)),
      page,
      pageSize,
      totalItems: total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      hasMore: page * pageSize < total,
    };
  }

  async getProduct(id: number): Promise<Product> {
    const row = await prisma.productSnapshot.findUnique({
      where: { connectionId_externalProductId: { connectionId: this.connectionId, externalProductId: id } },
    });
    if (!row) throw new AppError('NOT_FOUND', 'That product could not be found in this store.');
    return this.mapProduct(row);
  }

  private mapProduct(row: {
    externalProductId: number;
    name: string;
    sku: string;
    productType: string;
    price: string;
    salePrice: string | null;
    retailPrice: string | null;
    costPrice: string | null;
    currencyCode: string;
    weight: string | null;
    isVisible: boolean;
    availability: string;
    inventoryLevel: number | null;
    inventoryTracking: string;
    brandName: string | null;
    categoriesJson: string;
    channelsJson: string;
    customFieldsJson: string;
    imageUrl: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    variantCount: number;
    externalModifiedAt: Date | null;
    capturedAt: Date;
  }): Product {
    const categories = parseJsonLoose<{ id: number; name: string }[]>(row.categoriesJson, []);
    const channels = parseJsonLoose<number[]>(row.channelsJson, []);
    const customFields = parseJsonLoose<{ name: string; value: string }[]>(row.customFieldsJson, []);

    return {
      id: row.externalProductId,
      name: row.name,
      sku: row.sku,
      type: row.productType,
      price: row.price,
      salePrice: row.salePrice,
      retailPrice: row.retailPrice,
      costPrice: row.costPrice,
      currencyCode: row.currencyCode,
      weight: row.weight,
      isVisible: row.isVisible,
      availability: row.availability,
      inventoryLevel: row.inventoryLevel,
      inventoryTracking: row.inventoryTracking,
      brandId: null,
      brandName: row.brandName,
      categories: categories.map((category) => category.id),
      categoryNames: categories.map((category) => category.name),
      images: row.imageUrl
        ? [{ id: 1, url: row.imageUrl, isThumbnail: true, description: row.name }]
        : [],
      variants: [],
      customFields: customFields.map((field) => ({ id: null, name: field.name, value: field.value })),
      pageTitle: row.seoTitle,
      metaDescription: row.seoDescription,
      channelIds: channels,
      dateModified: row.externalModifiedAt ?? row.capturedAt,
      dateCreated: row.capturedAt,
    };
  }

  async listCategories(): Promise<Category[]> {
    const products = await prisma.productSnapshot.findMany({
      where: { connectionId: this.connectionId },
      select: { categoriesJson: true },
    });

    const counts = new Map<number, { name: string; count: number }>();
    for (const product of products) {
      for (const category of parseJsonLoose<{ id: number; name: string }[]>(
        product.categoriesJson,
        [],
      )) {
        const existing = counts.get(category.id);
        counts.set(category.id, {
          name: category.name,
          count: (existing?.count ?? 0) + 1,
        });
      }
    }

    return [...counts.entries()]
      .map(([id, value]) => ({
        id,
        parentId: 0,
        treeId: 1,
        name: value.name,
        path: value.name,
        isVisible: true,
        productCount: value.count,
        sortOrder: 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async listBrands(): Promise<Brand[]> {
    const rows = await prisma.productSnapshot.groupBy({
      by: ['brandName'],
      where: { connectionId: this.connectionId, brandName: { not: null } },
      _count: { _all: true },
    });
    return rows
      .filter((row): row is typeof row & { brandName: string } => row.brandName !== null)
      .map((row, index) => ({
        id: index + 1,
        name: row.brandName,
        pageTitle: row.brandName,
        imageUrl: null,
        productCount: row._count._all,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async listPriceLists(): Promise<PriceList[]> {
    const rows = await prisma.priceListSnapshot.findMany({
      where: { connectionId: this.connectionId },
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => ({
      id: row.externalPriceListId,
      name: row.name,
      active: row.isActive,
      dateCreated: row.capturedAt,
      dateModified: row.capturedAt,
    }));
  }

  async listPriceRecords(priceListId: number): Promise<PriceRecord[]> {
    const rows = await prisma.pricingEntry.findMany({
      where: { connectionId: this.connectionId, priceListExternalId: priceListId },
      orderBy: { sku: 'asc' },
    });
    return rows.map((row, index) => ({
      priceListId,
      variantId: index + 1,
      sku: row.sku,
      currency: row.currencyCode,
      price: row.basePrice,
      salePrice: row.salePrice,
      retailPrice: row.retailPrice,
      mapPrice: null,
    }));
  }

  async listInventoryLocations(): Promise<InventoryLocation[]> {
    const connection = await this.connection();
    const rows = await prisma.inventoryRecord.groupBy({
      by: ['locationExternalId', 'locationName'],
      where: { connectionId: this.connectionId },
    });
    if (rows.length === 0) {
      return [
        {
          id: 1,
          code: 'DEFAULT',
          label: 'Default location',
          enabled: true,
          typeId: 'PHYSICAL',
          countryCode: connection.countryCode,
        },
      ];
    }
    return rows.map((row) => ({
      id: row.locationExternalId ?? 1,
      code: (row.locationName ?? 'DEFAULT').toUpperCase().replace(/\s+/g, '_'),
      label: row.locationName ?? 'Default location',
      enabled: true,
      typeId: 'PHYSICAL',
      countryCode: connection.countryCode,
    }));
  }

  async listInventory(
    params: { locationId?: number; page?: number; pageSize?: number } = {},
  ): Promise<Paginated<InventoryItem>> {
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 100, 250);
    const where = {
      connectionId: this.connectionId,
      ...(params.locationId ? { locationExternalId: params.locationId } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.inventoryRecord.findMany({
        where,
        orderBy: { sku: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.inventoryRecord.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        locationId: row.locationExternalId,
        productId: row.externalProductId ?? 0,
        variantId: row.externalVariantId,
        sku: row.sku,
        availableToSell: row.quantity,
        totalInventory: row.quantity + row.buffer,
        safetyStock: row.safetyStock,
        isInStock: row.quantity > 0,
      })),
      page,
      pageSize,
      totalItems: total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      hasMore: page * pageSize < total,
    };
  }

  async listOrders(params: OrderQuery): Promise<Paginated<Order>> {
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 50, 250);

    const where = {
      connectionId: this.connectionId,
      ...(params.minDateCreated || params.maxDateCreated
        ? {
            placedAt: {
              ...(params.minDateCreated ? { gte: params.minDateCreated } : {}),
              ...(params.maxDateCreated ? { lte: params.maxDateCreated } : {}),
            },
          }
        : {}),
      ...(params.status ? { statusLabel: params.status } : {}),
      ...(params.customerId ? { customerExternalId: params.customerId } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.orderSnapshot.findMany({
        where,
        orderBy: { placedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { lines: true },
      }),
      prisma.orderSnapshot.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.mapOrder(row)),
      page,
      pageSize,
      totalItems: total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      hasMore: page * pageSize < total,
    };
  }

  async getOrder(id: number): Promise<Order> {
    const row = await prisma.orderSnapshot.findUnique({
      where: { connectionId_externalOrderId: { connectionId: this.connectionId, externalOrderId: id } },
      include: { lines: true },
    });
    if (!row) throw new AppError('NOT_FOUND', 'That order could not be found in this store.');
    return this.mapOrder(row);
  }

  private mapOrder(row: {
    externalOrderId: number;
    orderNumber: string;
    statusLabel: string;
    currencyCode: string;
    subtotal: string;
    shippingTotal: string;
    taxTotal: string;
    discountTotal: string;
    grandTotal: string;
    refundedTotal: string;
    itemCount: number;
    customerExternalId: number | null;
    customerName: string | null;
    customerEmailMasked: string | null;
    paymentMethod: string | null;
    paymentStatus: string;
    countryCode: string | null;
    staffNotes: string | null;
    placedAt: Date;
    externalUpdatedAt: Date | null;
    lines: {
      id: string;
      sku: string;
      name: string;
      quantity: number;
      unitPrice: string;
      lineTotal: string;
      externalProductId: number | null;
      variantLabel: string | null;
    }[];
  }): Order {
    return {
      id: row.externalOrderId,
      orderNumber: row.orderNumber,
      statusLabel: row.statusLabel,
      statusId: null,
      currencyCode: row.currencyCode,
      subtotal: row.subtotal,
      shippingTotal: row.shippingTotal,
      taxTotal: row.taxTotal,
      discountTotal: row.discountTotal,
      grandTotal: row.grandTotal,
      refundedTotal: row.refundedTotal,
      itemCount: row.itemCount,
      customerId: row.customerExternalId,
      customerName: row.customerName,
      customerEmailMasked: row.customerEmailMasked,
      channelId: null,
      paymentMethod: row.paymentMethod,
      paymentStatus: row.paymentStatus,
      countryCode: row.countryCode,
      staffNotes: row.staffNotes,
      dateCreated: row.placedAt,
      dateModified: row.externalUpdatedAt,
      lines: row.lines.map((line, index) => ({
        id: index + 1,
        productId: line.externalProductId,
        sku: line.sku,
        name: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        total: line.lineTotal,
        variantLabel: line.variantLabel,
      })),
      billingAddress: {
        name: row.customerName,
        company: null,
        city: null,
        stateOrProvince: null,
        postalCode: null,
        countryCode: row.countryCode,
      },
      shippingAddresses: [],
      isRefunded: row.refundedTotal !== '0.00',
    };
  }

  async listCustomers(params: CustomerQuery): Promise<Paginated<Customer>> {
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 50, 250);

    const where = {
      connectionId: this.connectionId,
      ...(params.search
        ? {
            OR: [
              { firstName: { contains: params.search } },
              { lastName: { contains: params.search } },
              { company: { contains: params.search } },
              { emailMasked: { contains: params.search } },
            ],
          }
        : {}),
      ...(params.customerGroupId ? { customerGroupExternalId: params.customerGroupId } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.customerSnapshot.findMany({
        where,
        orderBy: { lastOrderAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.customerSnapshot.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.externalCustomerId,
        firstName: row.firstName,
        lastName: row.lastName,
        emailMasked: row.emailMasked,
        phoneMasked: row.phoneMasked,
        company: row.company,
        customerGroupId: row.customerGroupExternalId,
        customerGroupName: row.customerGroupName,
        storeCredit: row.storeCredit,
        currencyCode: row.currencyCode,
        acceptsMarketing: row.acceptsMarketing,
        channelIds: [],
        dateCreated: row.externalCreatedAt,
        dateModified: row.capturedAt,
      })),
      page,
      pageSize,
      totalItems: total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      hasMore: page * pageSize < total,
    };
  }

  async listCustomerGroups(): Promise<CustomerGroup[]> {
    const rows = await prisma.customerGroupMapping.findMany({
      where: { connectionId: this.connectionId },
      orderBy: { externalGroupName: 'asc' },
    });
    return rows.map((row, index) => ({
      id: row.externalGroupId ?? index + 1,
      name: row.externalGroupName,
      isDefault: row.externalGroupName.toLowerCase().includes('retail'),
      discountType: row.discountSummary?.includes('%') ? 'percent' : 'fixed',
      discountAmount: row.discountSummary?.replace(/[^\d.]/g, '') || '0',
      categoryAccessType: 'all',
      categoryIds: [],
      memberCount: row.memberCount,
    }));
  }

  async listPages(params: { channelId?: number } = {}): Promise<Page[]> {
    const rows = await prisma.contentSnapshot.findMany({
      where: { connectionId: this.connectionId, contentType: 'PAGE' },
      orderBy: { title: 'asc' },
    });
    return rows.map((row, index) => ({
      id: Number(row.externalId ?? index + 1),
      name: row.title,
      type: 'page',
      url: parseJsonLoose<{ url?: string }>(row.metaJson, {}).url ?? `/${row.contentKey}`,
      isVisible: row.status === 'PUBLISHED',
      channelId: params.channelId ?? null,
      metaTitle: parseJsonLoose<{ metaTitle?: string }>(row.metaJson, {}).metaTitle ?? row.title,
      metaDescription: parseJsonLoose<{ metaDescription?: string }>(row.metaJson, {}).metaDescription ?? null,
    }));
  }

  async listWidgets(): Promise<Widget[]> {
    const rows = await prisma.contentSnapshot.findMany({
      where: { connectionId: this.connectionId, contentType: { in: ['WIDGET', 'BANNER'] } },
      orderBy: { title: 'asc' },
    });
    return rows.map((row) => ({
      uuid: row.id,
      name: row.title,
      widgetTemplateUuid: row.contentKey,
      channelId: null,
      dateModified: row.updatedAt,
    }));
  }

  async listRedirects(): Promise<Redirect[]> {
    const rows = await prisma.contentSnapshot.findMany({
      where: { connectionId: this.connectionId, contentType: 'REDIRECT' },
      orderBy: { contentKey: 'asc' },
    });
    return rows.map((row, index) => ({
      id: index + 1,
      fromPath: row.contentKey,
      toUrl: parseJsonLoose<{ to?: string }>(row.bodyJson, {}).to ?? '/',
      siteId: null,
    }));
  }

  async listScripts(): Promise<StorefrontScript[]> {
    const rows = await prisma.contentSnapshot.findMany({
      where: { connectionId: this.connectionId, contentType: 'SCRIPT' },
      orderBy: { title: 'asc' },
    });
    return rows.map((row) => ({
      uuid: row.id,
      name: row.title,
      location: parseJsonLoose<{ location?: string }>(row.metaJson, {}).location ?? 'head',
      visibility: 'storefront',
      channelId: null,
      kind: 'script_tag',
    }));
  }

  async listThemes(): Promise<Theme[]> {
    const assignments = await prisma.themeAssignment.findMany({
      where: { connectionId: this.connectionId },
      include: { release: true },
    });
    return assignments.map((assignment) => ({
      uuid: assignment.id,
      name: assignment.activeThemeName,
      version: assignment.activeThemeVersion,
      isPrivate: true,
      isActive: assignment.state === 'ACTIVE',
      variations: [{ uuid: `${assignment.id}-default`, name: 'Default', isCurrent: true }],
    }));
  }

  async listPromotions(): Promise<Promotion[]> {
    const rows = await prisma.promotionSnapshot.findMany({
      where: { connectionId: this.connectionId },
      orderBy: { name: 'asc' },
    });
    return rows.map((row, index) => ({
      id: row.externalPromotionId ?? index + 1,
      name: row.name,
      status: row.status,
      redemptionType: row.redemptionType,
      couponCode: row.couponCode,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      currentUses: row.usageCount,
      maxUses: row.usageLimit,
      channelIds: parseJsonLoose<number[]>(row.channelsJson, []),
      summary: row.discountSummary,
    }));
  }

  async probeCapabilities(): Promise<CapabilityProbeResult[]> {
    const connection = await this.connection();
    const verifiedAt = new Date();
    const hasSpareCapacity =
      connection.storefrontLimit != null && connection.storefrontsUsed != null
        ? connection.storefrontsUsed < connection.storefrontLimit
        : null;

    // A store seeded as CRITICAL exercises the permission-missing UI paths.
    const grantedScopes =
      connection.healthStatus === 'CRITICAL' ? ['store_v2_information_read_only'] : null;

    return CAPABILITY_LIST.map((definition) => {
      const { status, reason } = resolveCapabilityStatus(definition, {
        grantedScopes,
        multiStorefrontEnabled: connection.msfEnabled,
        hasSpareStorefrontCapacity: hasSpareCapacity,
        isDemo: true,
      });
      return {
        key: definition.key,
        status,
        reason: reason ?? undefined,
        verifiedAt,
        source: 'DEMO' as const,
      };
    });
  }
}
