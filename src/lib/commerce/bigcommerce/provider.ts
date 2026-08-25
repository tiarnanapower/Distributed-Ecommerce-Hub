/**
 * BigCommerce provider.
 *
 * Implements `CommerceProvider` against the real REST Management API. Only
 * verified read operations are implemented; write operations are absent from
 * this class by design so no code path can call one before the capability
 * registry has been extended and the operation verified per store.
 */
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import {
  CAPABILITY_LIST,
  resolveCapabilityStatus,
} from '@/lib/commerce/capability-registry';
import {
  maskEmail,
  maskPhone,
  type Brand,
  type CapabilityProbeResult,
  type Category,
  type Channel,
  type CommerceProvider,
  type ConnectionResult,
  type Customer,
  type CustomerGroup,
  type CustomerQuery,
  type InventoryItem,
  type InventoryLocation,
  type Order,
  type OrderQuery,
  type Page,
  type Paginated,
  type PriceList,
  type PriceRecord,
  type Product,
  type ProductQuery,
  type Promotion,
  type Redirect,
  type StoreInfo,
  type StorefrontScript,
  type Theme,
  type Widget,
} from '@/lib/commerce/types';
import { BigCommerceClient, type BigCommerceCredentials } from './client';
import * as S from './schemas';

export interface BigCommerceProviderOptions {
  connectionId: string;
  credentials: BigCommerceCredentials;
  /** Scopes recorded when the credential was saved, used for capability gating. */
  knownScopes?: string[] | null;
  correlationId?: string;
}

export class BigCommerceProvider implements CommerceProvider {
  readonly kind = 'bigcommerce' as const;
  readonly connectionId: string;
  readonly isSimulated = false;

  private readonly client: BigCommerceClient;
  private readonly correlationId?: string;
  private knownScopes: string[] | null;
  private cachedStoreInfo: StoreInfo | null = null;

  constructor(options: BigCommerceProviderOptions) {
    this.connectionId = options.connectionId;
    this.client = new BigCommerceClient(options.credentials, options.connectionId);
    this.knownScopes = options.knownScopes ?? null;
    this.correlationId = options.correlationId;
  }

  private opts(extra: Record<string, unknown> = {}) {
    return { correlationId: this.correlationId, ...extra };
  }

  // -------------------------------------------------------------------------
  // Connection
  // -------------------------------------------------------------------------

  async testConnection(): Promise<ConnectionResult> {
    const startedAt = Date.now();
    try {
      // GET /v2/store is the cheapest proof that a token is valid.
      const { data } = await this.client.requestValidated('store', S.storeInfoSchema, {
        version: 'v2',
        noRetry: true,
        correlationId: this.correlationId,
      });

      // BigCommerce has no endpoint that introspects an API account token's
      // scopes, so unless an operator has recorded them we genuinely do not
      // know. Saying so is more useful than implying we checked.
      const grantedScopes = this.knownScopes ?? [];
      const scopesKnown = grantedScopes.length > 0;
      const missingScopes = scopesKnown ? this.computeMissingScopes(grantedScopes) : [];

      return {
        ok: true,
        latencyMs: Date.now() - startedAt,
        grantedScopes,
        missingScopes,
        storeName: data.name,
        storeHash: typeof data.id === 'string' ? data.id : undefined,
        message: !scopesKnown
          ? `Connected to “${data.name}”. The token works. BigCommerce does not expose which scopes an API account holds, so capabilities are reported from the registry — a read that turns out to be unauthorised will surface as a 403 with the scope named.`
          : missingScopes.length === 0
            ? `Connected to “${data.name}”. The API account has every scope this platform uses.`
            : `Connected to “${data.name}”. ${missingScopes.length} scope(s) this platform can use are not granted; the affected features show as permission-missing.`,
        checkedAt: new Date(),
        isSimulated: false,
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : null;
      logger.warn('Connection test failed', {
        connectionId: this.connectionId,
        code: appError?.code,
      });
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        grantedScopes: [],
        missingScopes: [],
        message: appError?.message ?? 'The connection test failed.',
        errorCode: appError?.code ?? 'UPSTREAM_ERROR',
        checkedAt: new Date(),
        isSimulated: false,
      };
    }
  }

  private computeMissingScopes(granted: string[]): string[] {
    if (granted.length === 0) return [];
    const needed = new Set<string>();
    for (const definition of CAPABILITY_LIST) {
      if (definition.defaultStatus === 'NOT_SUPPORTED') continue;
      const scope = definition.isWrite ? definition.readScope : definition.requiredScope;
      if (scope) needed.add(scope);
    }
    return [...needed].filter((scope) => !granted.includes(scope)).sort();
  }

  async getStoreInfo(): Promise<StoreInfo> {
    if (this.cachedStoreInfo) return this.cachedStoreInfo;

    const { data } = await this.client.requestValidated('store', S.storeInfoSchema, {
      version: 'v2',
      correlationId: this.correlationId,
    });

    const limits = data.features?.storefront_limits;
    const info: StoreInfo = {
      storeHash: typeof data.id === 'string' ? data.id : String(data.id ?? ''),
      name: data.name,
      domain: data.domain ?? null,
      secureUrl: data.secure_url ?? null,
      controlPanelUrl: data.control_panel_base_url ?? null,
      status: data.status ?? null,
      currencyCode: data.currency ?? 'USD',
      currencySymbol: data.currency_symbol ?? null,
      weightUnits: data.weight_units ?? null,
      timezoneName: data.timezone?.name ?? null,
      language: data.language ?? null,
      countryCode: data.country_code ?? null,
      planName: data.plan_name ?? null,
      planLevel: data.plan_level ?? null,
      multiStorefrontEnabled: data.features?.multi_storefront_enabled ?? null,
      storefrontLimit: limits?.total_including_inactive ?? limits?.active ?? null,
      features: {
        stencil: data.features?.stencil_enabled ?? null,
        sitewideHttps: data.features?.sitewidehttps_enabled ?? null,
        checkoutType: data.features?.checkout_type ?? null,
        graphqlStorefrontApi: data.features?.graphql_storefront_api_enabled ?? null,
        activeStorefronts: limits?.active ?? null,
        planIsTrial: data.plan_is_trial ?? null,
      },
      isSimulated: false,
    };

    this.cachedStoreInfo = info;
    return info;
  }

  async listChannels(): Promise<Channel[]> {
    const { data } = await this.client.requestValidated('channels', S.channelListSchema, {
      query: { limit: 250 },
      correlationId: this.correlationId,
    });

    // Sites are a separate resource; fetch them so the UI can show storefront URLs.
    const siteByChannel = new Map<number, { id: number; url: string | null }>();
    try {
      const sites = await this.client.requestValidated('sites', S.siteListSchema, {
        query: { limit: 250 },
        correlationId: this.correlationId,
      });
      for (const site of sites.data) {
        if (site.channel_id != null) {
          siteByChannel.set(site.channel_id, { id: site.id, url: site.url ?? null });
        }
      }
    } catch (error) {
      // Sites requires its own scope; absence is informative, not fatal.
      logger.debug('Sites unavailable while listing channels', {
        connectionId: this.connectionId,
        reason: error instanceof AppError ? error.code : 'unknown',
      });
    }

    return data.map((channel) => {
      const site = siteByChannel.get(channel.id);
      return {
        id: channel.id,
        name: channel.name,
        platform: channel.platform,
        type: channel.type,
        status: channel.status,
        isListableFromUi: channel.is_listable_from_ui,
        isVisible: channel.is_visible,
        externalId: channel.external_id ?? null,
        siteUrl: site?.url ?? null,
        siteId: site?.id ?? null,
        currencyCode: null,
        locale: null,
        createdAt: channel.date_created,
        updatedAt: channel.date_modified,
      };
    });
  }

  // -------------------------------------------------------------------------
  // Catalog
  // -------------------------------------------------------------------------

  async listProducts(params: ProductQuery): Promise<Paginated<Product>> {
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 50, 250);
    const storeInfo = await this.getStoreInfo().catch(() => null);
    const currencyCode = storeInfo?.currencyCode ?? 'USD';

    const include = (params.include ?? ['images', 'custom_fields']).join(',');
    const { data, meta } = await this.client.requestValidated(
      'catalog/products',
      S.productListSchema,
      this.opts({
        query: {
          page,
          limit: pageSize,
          keyword: params.search,
          sku: params.sku,
          'categories:in': params.categoryId,
          brand_id: params.brandId,
          is_visible: params.isVisible,
          sort: params.sort,
          direction: params.direction,
          include,
        },
      }),
    );

    const brandNames = await this.brandNameIndex().catch(() => new Map<number, string>());
    const categoryNames = await this.categoryNameIndex().catch(() => new Map<number, string>());

    const items = data.map((raw) => this.mapProduct(raw, currencyCode, brandNames, categoryNames));
    const pagination = meta?.pagination;

    return {
      items,
      page,
      pageSize,
      totalItems: pagination?.total ?? null,
      totalPages: pagination?.totalPages ?? null,
      hasMore: pagination ? pagination.currentPage < pagination.totalPages : items.length === pageSize,
    };
  }

  async getProduct(id: number): Promise<Product> {
    const storeInfo = await this.getStoreInfo().catch(() => null);
    const { data } = await this.client.requestValidated(
      `catalog/products/${id}`,
      S.productSchema,
      this.opts({ query: { include: 'images,variants,custom_fields,options' } }),
    );
    const brandNames = await this.brandNameIndex().catch(() => new Map<number, string>());
    const categoryNames = await this.categoryNameIndex().catch(() => new Map<number, string>());
    return this.mapProduct(data, storeInfo?.currencyCode ?? 'USD', brandNames, categoryNames);
  }

  private mapProduct(
    raw: import('zod').infer<typeof S.productSchema>,
    currencyCode: string,
    brandNames: Map<number, string>,
    categoryNames: Map<number, string>,
  ): Product {
    return {
      id: raw.id,
      name: raw.name,
      sku: raw.sku,
      type: raw.type,
      price: raw.price,
      salePrice: raw.sale_price ?? null,
      retailPrice: raw.retail_price ?? null,
      costPrice: raw.cost_price ?? null,
      currencyCode,
      weight: raw.weight ?? null,
      isVisible: raw.is_visible,
      availability: raw.availability,
      inventoryLevel: raw.inventory_level ?? null,
      inventoryTracking: raw.inventory_tracking,
      brandId: raw.brand_id ?? null,
      brandName: raw.brand_id ? (brandNames.get(raw.brand_id) ?? null) : null,
      categories: raw.categories,
      categoryNames: raw.categories.map((id) => categoryNames.get(id) ?? `Category ${id}`),
      images: (raw.images ?? []).map((image) => ({
        id: image.id,
        url: image.url_standard ?? image.url_thumbnail ?? image.url_zoom ?? '',
        isThumbnail: image.is_thumbnail,
        description: image.description ?? null,
      })),
      variants: (raw.variants ?? []).map((variant) => ({
        id: variant.id,
        sku: variant.sku ?? '',
        price: variant.price ?? null,
        costPrice: variant.cost_price ?? null,
        inventoryLevel: variant.inventory_level ?? null,
        optionLabel: variant.option_values.map((option) => option.label).filter(Boolean).join(' / '),
      })),
      customFields: (raw.custom_fields ?? []).map((field) => ({
        id: field.id ?? null,
        name: field.name,
        value: field.value,
      })),
      pageTitle: raw.page_title ?? null,
      metaDescription: raw.meta_description ?? null,
      // Channel assignments come from the Channel Listings API, which needs its
      // own scope. Left empty rather than guessed at.
      channelIds: [],
      dateModified: raw.date_modified,
      dateCreated: raw.date_created,
    };
  }

  private brandIndexCache: Map<number, string> | null = null;

  private async brandNameIndex(): Promise<Map<number, string>> {
    if (this.brandIndexCache) return this.brandIndexCache;
    const brands = await this.listBrands();
    this.brandIndexCache = new Map(brands.map((brand) => [brand.id, brand.name]));
    return this.brandIndexCache;
  }

  private categoryIndexCache: Map<number, string> | null = null;

  private async categoryNameIndex(): Promise<Map<number, string>> {
    if (this.categoryIndexCache) return this.categoryIndexCache;
    const categories = await this.listCategories();
    this.categoryIndexCache = new Map(categories.map((category) => [category.id, category.name]));
    return this.categoryIndexCache;
  }

  async listCategories(): Promise<Category[]> {
    // /v3/catalog/trees/categories is the current surface; the older
    // /v3/catalog/categories is deprecated.
    const { data } = await this.client.requestValidated(
      'catalog/trees/categories',
      S.categoryListSchema,
      this.opts({ query: { limit: 250 } }),
    );

    const byId = new Map<number, { name: string; parentId: number }>();
    for (const raw of data) {
      const id = raw.category_id ?? raw.id;
      if (id === undefined) continue;
      byId.set(id, { name: raw.name, parentId: raw.parent_id });
    }

    // Categories form a tree; walk up to build a readable path, with a depth
    // guard so a malformed cycle cannot hang the request.
    const pathOf = (startId: number): string => {
      const parts: string[] = [];
      let cursor: number | undefined = startId;
      for (let depth = 0; depth < 20 && cursor && byId.has(cursor); depth += 1) {
        const node: { name: string; parentId: number } = byId.get(cursor)!;
        parts.unshift(node.name);
        cursor = node.parentId || undefined;
      }
      return parts.join(' / ');
    };

    const categories: Category[] = [];
    for (const raw of data) {
      const id = raw.category_id ?? raw.id;
      if (id === undefined) continue;
      categories.push({
        id,
        parentId: raw.parent_id,
        treeId: raw.tree_id ?? null,
        name: raw.name,
        path: pathOf(id),
        isVisible: raw.is_visible,
        productCount: null,
        sortOrder: raw.sort_order,
      });
    }
    return categories;
  }

  async listBrands(): Promise<Brand[]> {
    const { data } = await this.client.requestValidated(
      'catalog/brands',
      S.brandListSchema,
      this.opts({ query: { limit: 250 } }),
    );
    return data.map((raw) => ({
      id: raw.id,
      name: raw.name,
      pageTitle: raw.page_title ?? null,
      imageUrl: raw.image_url ?? null,
      productCount: null,
    }));
  }

  // -------------------------------------------------------------------------
  // Pricing
  // -------------------------------------------------------------------------

  async listPriceLists(): Promise<PriceList[]> {
    const { data } = await this.client.requestValidated(
      'pricelists',
      S.priceListsSchema,
      this.opts({ query: { limit: 250 } }),
    );
    return data.map((raw) => ({
      id: raw.id,
      name: raw.name,
      active: raw.active,
      dateCreated: raw.date_created,
      dateModified: raw.date_modified,
    }));
  }

  async listPriceRecords(priceListId: number): Promise<PriceRecord[]> {
    const { data } = await this.client.requestValidated(
      `pricelists/${priceListId}/records`,
      S.priceRecordsSchema,
      this.opts({ query: { limit: 250 } }),
    );
    return data.map((raw) => ({
      priceListId: raw.price_list_id,
      variantId: raw.variant_id,
      sku: raw.sku ?? null,
      currency: raw.currency.toUpperCase(),
      price: raw.price,
      salePrice: raw.sale_price ?? null,
      retailPrice: raw.retail_price ?? null,
      mapPrice: raw.map_price ?? null,
    }));
  }

  // -------------------------------------------------------------------------
  // Inventory
  // -------------------------------------------------------------------------

  async listInventoryLocations(): Promise<InventoryLocation[]> {
    const { data } = await this.client.requestValidated(
      'inventory/locations',
      S.inventoryLocationsSchema,
      this.opts({ query: { limit: 250 } }),
    );
    return data.map((raw) => ({
      id: raw.id,
      code: raw.code,
      label: raw.label,
      enabled: raw.enabled,
      typeId: raw.type_id ?? null,
      countryCode: raw.address?.country_code ?? null,
    }));
  }

  async listInventory(
    params: { locationId?: number; page?: number; pageSize?: number } = {},
  ): Promise<Paginated<InventoryItem>> {
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 100, 250);
    const path = params.locationId
      ? `inventory/locations/${params.locationId}/items`
      : 'inventory/items';

    const { data, meta } = await this.client.requestValidated(
      path,
      S.inventoryItemsSchema,
      this.opts({ query: { page, limit: pageSize } }),
    );

    return {
      items: data.map((raw) => ({
        locationId: raw.location_id ?? params.locationId ?? null,
        productId: raw.product_id ?? raw.identity?.product_id ?? 0,
        variantId: raw.variant_id ?? raw.identity?.variant_id ?? null,
        sku: raw.sku ?? raw.identity?.sku ?? '',
        availableToSell: raw.available_to_sell ?? null,
        totalInventory: raw.total_inventory_onhand ?? null,
        safetyStock: raw.settings?.safety_stock ?? null,
        isInStock: raw.settings?.is_in_stock ?? (raw.available_to_sell ?? 0) > 0,
      })),
      page,
      pageSize,
      totalItems: meta?.pagination?.total ?? null,
      totalPages: meta?.pagination?.totalPages ?? null,
      hasMore: meta?.pagination ? meta.pagination.currentPage < meta.pagination.totalPages : false,
    };
  }

  // -------------------------------------------------------------------------
  // Orders
  // -------------------------------------------------------------------------

  async listOrders(params: OrderQuery): Promise<Paginated<Order>> {
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 50, 250);

    // Orders live on v2, which has no pagination envelope: an empty array means
    // the end of the collection.
    const { data } = await this.client.requestValidated(
      'orders',
      S.orderListSchema,
      this.opts({
        version: 'v2',
        query: {
          page,
          limit: pageSize,
          status_id: params.statusId,
          channel_id: params.channelId,
          customer_id: params.customerId,
          min_date_created: params.minDateCreated?.toUTCString(),
          max_date_created: params.maxDateCreated?.toUTCString(),
          sort: params.sort ? `${params.sort}:${params.direction ?? 'desc'}` : 'date_created:desc',
        },
      }),
    );

    return {
      items: data.map((raw) => this.mapOrder(raw, [], null, [])),
      page,
      pageSize,
      totalItems: null,
      totalPages: null,
      hasMore: data.length === pageSize,
    };
  }

  async getOrder(id: number): Promise<Order> {
    const { data } = await this.client.requestValidated(
      `orders/${id}`,
      S.orderSchema,
      this.opts({ version: 'v2' }),
    );

    const [lines, shipping] = await Promise.all([
      this.client
        .requestValidated(`orders/${id}/products`, S.orderProductsSchema, this.opts({ version: 'v2' }))
        .then((response) => response.data)
        .catch(() => []),
      this.client
        .requestValidated(
          `orders/${id}/shipping_addresses`,
          S.orderShippingAddressesSchema,
          this.opts({ version: 'v2' }),
        )
        .then((response) => response.data)
        .catch(() => []),
    ]);

    return this.mapOrder(data, lines, null, shipping);
  }

  private mapOrder(
    raw: import('zod').infer<typeof S.orderSchema>,
    lines: import('zod').infer<typeof S.orderProductsSchema>,
    _unused: null,
    shipping: import('zod').infer<typeof S.orderShippingAddressesSchema>,
  ): Order {
    const billing = raw.billing_address;
    const customerName = [billing?.first_name, billing?.last_name].filter(Boolean).join(' ') || null;

    return {
      id: raw.id,
      orderNumber: String(raw.id),
      statusLabel: raw.status,
      statusId: raw.status_id ?? null,
      currencyCode: raw.currency_code.toUpperCase(),
      subtotal: raw.subtotal_inc_tax,
      shippingTotal: raw.shipping_cost_inc_tax,
      taxTotal: raw.total_tax,
      discountTotal: raw.discount_amount,
      grandTotal: raw.total_inc_tax,
      refundedTotal: raw.refunded_amount,
      itemCount: raw.items_total,
      customerId: raw.customer_id ?? null,
      customerName,
      // Masked here, at the boundary — the raw address email never travels further.
      customerEmailMasked: billing?.email ? maskEmail(billing.email) : null,
      channelId: raw.channel_id ?? null,
      paymentMethod: raw.payment_method ?? null,
      paymentStatus: raw.payment_status ?? 'unknown',
      countryCode: billing?.country_iso2 ?? null,
      staffNotes: raw.staff_notes ?? null,
      dateCreated: new Date(raw.date_created),
      dateModified: raw.date_modified ? new Date(raw.date_modified) : null,
      lines: lines.map((line) => ({
        id: line.id,
        productId: line.product_id ?? null,
        sku: line.sku ?? '',
        name: line.name,
        quantity: line.quantity,
        unitPrice: line.price_inc_tax,
        total: line.total_inc_tax,
        variantLabel:
          line.product_options
            .map((option) => `${option.display_name}: ${option.display_value}`)
            .join(', ') || null,
      })),
      billingAddress: billing
        ? {
            name: customerName,
            company: billing.company ?? null,
            city: billing.city ?? null,
            stateOrProvince: billing.state ?? null,
            postalCode: billing.zip ?? null,
            countryCode: billing.country_iso2 ?? null,
          }
        : null,
      shippingAddresses: shipping.map((address) => ({
        name: [address.first_name, address.last_name].filter(Boolean).join(' ') || null,
        company: address.company ?? null,
        city: address.city ?? null,
        stateOrProvince: address.state ?? null,
        postalCode: address.zip ?? null,
        countryCode: address.country_iso2 ?? null,
      })),
      isRefunded: Number(raw.refunded_amount) > 0,
    };
  }

  // -------------------------------------------------------------------------
  // Customers
  // -------------------------------------------------------------------------

  async listCustomers(params: CustomerQuery): Promise<Paginated<Customer>> {
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 50, 250);

    const { data, meta } = await this.client.requestValidated(
      'customers',
      S.customerListSchema,
      this.opts({
        query: {
          page,
          limit: pageSize,
          'name:like': params.search,
          'customer_group_id:in': params.customerGroupId,
        },
      }),
    );

    const groups = await this.listCustomerGroups().catch(() => [] as CustomerGroup[]);
    const groupNames = new Map(groups.map((group) => [group.id, group.name]));

    return {
      items: data.map((raw) => ({
        id: raw.id,
        firstName: raw.first_name ?? null,
        lastName: raw.last_name ?? null,
        emailMasked: maskEmail(raw.email),
        phoneMasked: maskPhone(raw.phone),
        company: raw.company ?? null,
        customerGroupId: raw.customer_group_id ?? null,
        customerGroupName: raw.customer_group_id
          ? (groupNames.get(raw.customer_group_id) ?? null)
          : null,
        storeCredit: (raw.store_credit_amounts[0]?.amount ?? 0).toFixed(2),
        currencyCode: 'USD',
        acceptsMarketing: raw.accepts_product_review_abandoned_cart_emails,
        channelIds: raw.channel_ids ?? [],
        dateCreated: raw.date_created,
        dateModified: raw.date_modified,
      })),
      page,
      pageSize,
      totalItems: meta?.pagination?.total ?? null,
      totalPages: meta?.pagination?.totalPages ?? null,
      hasMore: meta?.pagination ? meta.pagination.currentPage < meta.pagination.totalPages : false,
    };
  }

  async listCustomerGroups(): Promise<CustomerGroup[]> {
    const { data } = await this.client.requestValidated(
      'customer_groups',
      S.customerGroupListSchema,
      this.opts({ version: 'v2', query: { limit: 250 } }),
    );
    return data.map((raw) => {
      const rule = raw.discount_rules[0];
      return {
        id: raw.id,
        name: raw.name,
        isDefault: raw.is_default,
        discountType: rule?.method ?? 'none',
        discountAmount: rule?.amount !== undefined ? String(rule.amount) : '0',
        categoryAccessType: raw.category_access?.type ?? 'all',
        categoryIds: raw.category_access?.categories ?? [],
        memberCount: null,
      };
    });
  }

  // -------------------------------------------------------------------------
  // Content
  // -------------------------------------------------------------------------

  async listPages(params: { channelId?: number } = {}): Promise<Page[]> {
    const { data } = await this.client.requestValidated(
      'content/pages',
      S.pageListSchema,
      this.opts({ query: { limit: 250, 'channel_id:in': params.channelId } }),
    );
    return data.map((raw) => ({
      id: raw.id,
      name: raw.name,
      type: raw.type,
      url: raw.url ?? null,
      isVisible: raw.is_visible,
      channelId: raw.channel_id ?? null,
      metaTitle: raw.meta_title ?? null,
      metaDescription: raw.meta_description ?? null,
    }));
  }

  async listWidgets(params: { channelId?: number } = {}): Promise<Widget[]> {
    const { data } = await this.client.requestValidated(
      'content/widgets',
      S.widgetListSchema,
      this.opts({ query: { limit: 250, channel_id: params.channelId } }),
    );
    return data.map((raw) => ({
      uuid: raw.uuid,
      name: raw.name,
      widgetTemplateUuid: raw.widget_template_uuid,
      channelId: raw.channel_id ?? null,
      dateModified: raw.date_modified,
    }));
  }

  async listRedirects(params: { siteId?: number } = {}): Promise<Redirect[]> {
    const { data } = await this.client.requestValidated(
      'storefront/redirects',
      S.redirectListSchema,
      this.opts({ query: { limit: 250, site_id: params.siteId } }),
    );
    return data.map((raw) => ({
      id: raw.id,
      fromPath: raw.from_path,
      toUrl: raw.to?.url ?? raw.to_url ?? '',
      siteId: raw.site_id ?? null,
    }));
  }

  async listScripts(params: { channelId?: number } = {}): Promise<StorefrontScript[]> {
    const { data } = await this.client.requestValidated(
      'content/scripts',
      S.scriptListSchema,
      this.opts({ query: { limit: 250, channel_id: params.channelId } }),
    );
    return data.map((raw) => ({
      uuid: raw.uuid,
      name: raw.name,
      location: raw.location,
      visibility: raw.visibility,
      channelId: raw.channel_id ?? null,
      kind: raw.kind,
    }));
  }

  async listThemes(): Promise<Theme[]> {
    const { data } = await this.client.requestValidated(
      'themes',
      S.themeListSchema,
      this.opts({ query: { limit: 250 } }),
    );
    return data.map((raw) => ({
      uuid: raw.uuid,
      name: raw.name,
      // The Themes API does not report a semantic version on the theme record;
      // version lives inside the theme package's config.json.
      version: 'unknown',
      isPrivate: raw.is_private,
      isActive: raw.variations.some((variation) => variation.is_current),
      variations: raw.variations.map((variation) => ({
        uuid: variation.uuid,
        name: variation.name,
        isCurrent: variation.is_current,
      })),
    }));
  }

  // -------------------------------------------------------------------------
  // Promotions
  // -------------------------------------------------------------------------

  async listPromotions(): Promise<Promotion[]> {
    const { data } = await this.client.requestValidated(
      'promotions',
      S.promotionListSchema,
      this.opts({ query: { limit: 250 } }),
    );
    return data.map((raw) => ({
      id: raw.id,
      name: raw.name,
      status: raw.status,
      redemptionType: raw.redemption_type,
      // Coupon codes live on a separate resource; not fetched per promotion to
      // avoid an N+1 against a rate-limited API.
      couponCode: null,
      startsAt: raw.start_date,
      endsAt: raw.end_date,
      currentUses: raw.current_uses ?? null,
      maxUses: raw.max_uses ?? null,
      channelIds: (raw.channels ?? []).map((channel) => channel.id),
      summary: 'Rule detail is available in the BigCommerce control panel.',
    }));
  }

  // -------------------------------------------------------------------------
  // Capabilities
  // -------------------------------------------------------------------------

  async probeCapabilities(): Promise<CapabilityProbeResult[]> {
    const storeInfo = await this.getStoreInfo().catch(() => null);
    const verifiedAt = new Date();
    const activeStorefronts = Number(storeInfo?.features.activeStorefronts ?? 0);
    const hasSpareCapacity =
      storeInfo?.storefrontLimit != null ? activeStorefronts < storeInfo.storefrontLimit : null;

    return CAPABILITY_LIST.map((definition) => {
      const { status, reason } = resolveCapabilityStatus(definition, {
        grantedScopes: this.knownScopes,
        multiStorefrontEnabled: storeInfo?.multiStorefrontEnabled ?? null,
        hasSpareStorefrontCapacity: hasSpareCapacity,
        isDemo: false,
      });
      return {
        key: definition.key,
        status,
        reason: reason ?? undefined,
        verifiedAt,
        source: this.knownScopes ? ('SCOPE_PROBE' as const) : ('STATIC_REGISTRY' as const),
      };
    });
  }

  setKnownScopes(scopes: string[] | null): void {
    this.knownScopes = scopes;
  }
}
