/**
 * Capability registry.
 *
 * The single, honest description of what this platform can actually do to a
 * BigCommerce store. Every UI affordance and every write path consults it.
 *
 * The rules it encodes:
 *  * `defaultStatus` is what we claim *before* a live probe. It is never more
 *    optimistic than the implementation: an operation the integration layer has
 *    not implemented is `NOT_IMPLEMENTED`, even where BigCommerce supports it.
 *  * `requiredScope` uses the exact machine-readable OAuth scope strings from
 *    the BigCommerce API-accounts documentation. A missing scope downgrades a
 *    capability to `PERMISSION_MISSING` (or `READ_ONLY` where the read scope is
 *    present but the modify scope is not).
 *  * `channelApplicable` is false where BigCommerce genuinely has no per-channel
 *    variation. The UI must not offer per-channel control in that case.
 *  * `requiresConfirmation` and `isReversible` drive the destructive-action
 *    guard rails in the deployment workflow.
 *
 * Sources: BigCommerce developer documentation, "API accounts and OAuth scopes"
 * and the REST Management API reference. See docs/capability-matrix.md for the
 * per-capability citation list.
 */
import type { CapabilityStatus } from '@/lib/enums';
import type { ResourceCategory } from '@/lib/resource-categories';
import { CAPABILITY_KEYS, type CapabilityKey } from './capability-keys';

export interface CapabilityDefinition {
  key: CapabilityKey;
  label: string;
  group: string;
  resourceCategory: ResourceCategory;
  /** What the platform will do today, absent a live probe. */
  defaultStatus: CapabilityStatus;
  /** Exact BigCommerce OAuth scope required for the operation. */
  requiredScope: string | null;
  /** Read scope that still permits a degraded, read-only experience. */
  readScope?: string | null;
  /** Documented API surface, shown in the capability drawer. */
  apiSurface: string;
  /** Whether the operation writes to the store. */
  isWrite: boolean;
  /** Whether it can meaningfully differ per storefront channel. */
  channelApplicable: boolean;
  /** Whether the operation depends on plan entitlements. */
  planDependency: string | null;
  /** Whether a typed confirmation is required before executing. */
  requiresConfirmation: boolean;
  /** Whether the platform can undo it. */
  isReversible: boolean;
  /** Explanation shown whenever the status is not AVAILABLE. */
  unavailableReason: string | null;
  /** Operator-facing note, always shown. */
  note: string;
  docsPath: string;
}

const D = (definition: CapabilityDefinition) => definition;

export const CAPABILITY_DEFINITIONS: Record<CapabilityKey, CapabilityDefinition> = {
  // -------------------------------------------------------------------------
  // Catalog
  // -------------------------------------------------------------------------
  'products.read': D({
    key: 'products.read',
    label: 'Read products',
    group: 'Catalog',
    resourceCategory: 'PRODUCTS',
    defaultStatus: 'AVAILABLE',
    requiredScope: 'store_v2_products_read_only',
    apiSurface: 'GET /v3/catalog/products',
    isWrite: false,
    channelApplicable: false,
    planDependency: null,
    requiresConfirmation: false,
    isReversible: true,
    unavailableReason: null,
    note: 'Implemented and verified. Product data is shared by every channel in the store.',
    docsPath: '/api-reference/store-management/catalog',
  }),
  'products.update': D({
    key: 'products.update',
    label: 'Update products',
    group: 'Catalog',
    resourceCategory: 'PRODUCTS',
    defaultStatus: 'NOT_IMPLEMENTED',
    requiredScope: 'store_v2_products',
    readScope: 'store_v2_products_read_only',
    apiSurface: 'PUT /v3/catalog/products/{product_id}',
    isWrite: true,
    channelApplicable: false,
    planDependency: null,
    requiresConfirmation: true,
    isReversible: false,
    unavailableReason:
      'BigCommerce supports this, but the write path is not enabled in this release. Catalog deployments run as dry-runs and produce a change plan instead.',
    note: 'Enabling this requires per-store capability verification plus an approved deployment. See docs/production-readiness.md.',
    docsPath: '/api-reference/store-management/catalog',
  }),
  'products.create': D({
    key: 'products.create',
    label: 'Create products',
    group: 'Catalog',
    resourceCategory: 'PRODUCTS',
    defaultStatus: 'NOT_IMPLEMENTED',
    requiredScope: 'store_v2_products',
    readScope: 'store_v2_products_read_only',
    apiSurface: 'POST /v3/catalog/products',
    isWrite: true,
    channelApplicable: false,
    planDependency: null,
    requiresConfirmation: true,
    isReversible: false,
    unavailableReason:
      'Not enabled in this release. Missing products are reported as conflicts and included in the dry-run plan.',
    note: 'Product ids are assigned by the target store, so creation always produces a new mapping row.',
    docsPath: '/api-reference/store-management/catalog',
  }),
  'products.channel_assign': D({
    key: 'products.channel_assign',
    label: 'Assign products to channels',
    group: 'Catalog',
    resourceCategory: 'PRODUCTS',
    defaultStatus: 'NOT_IMPLEMENTED',
    requiredScope: 'store_channel_listings',
    readScope: 'store_channel_listings_read_only',
    apiSurface: 'PUT /v3/channels/{channel_id}/listings',
    isWrite: true,
    channelApplicable: true,
    planDependency: 'Requires Multi-Storefront on the store.',
    requiresConfirmation: true,
    isReversible: true,
    unavailableReason: 'Read of channel listings is implemented; the write path is not enabled in this release.',
    note: 'Only meaningful inside a Multi-Storefront store. Independent stores have no shared listing surface.',
    docsPath: '/api-reference/store-management/channels',
  }),
  'categories.read': D({
    key: 'categories.read',
    label: 'Read categories',
    group: 'Catalog',
    resourceCategory: 'CATEGORIES',
    defaultStatus: 'AVAILABLE',
    requiredScope: 'store_v2_products_read_only',
    apiSurface: 'GET /v3/catalog/trees/categories',
    isWrite: false,
    channelApplicable: true,
    planDependency: null,
    requiresConfirmation: false,
    isReversible: true,
    unavailableReason: null,
    note: 'Multi-Storefront stores can hold several category trees, each assigned to a channel.',
    docsPath: '/api-reference/store-management/catalog',
  }),
  'categories.manage': D({
    key: 'categories.manage',
    label: 'Manage categories',
    group: 'Catalog',
    resourceCategory: 'CATEGORIES',
    defaultStatus: 'NOT_IMPLEMENTED',
    requiredScope: 'store_v2_products',
    readScope: 'store_v2_products_read_only',
    apiSurface: 'POST/PUT /v3/catalog/trees/categories',
    isWrite: true,
    channelApplicable: true,
    planDependency: null,
    requiresConfirmation: true,
    isReversible: false,
    unavailableReason: 'Not enabled in this release. Category drift is reported and planned, not applied.',
    note: 'Category ids differ per store, so every copy needs an explicit mapping.',
    docsPath: '/api-reference/store-management/catalog',
  }),
  'brands.read': D({
    key: 'brands.read',
    label: 'Read brands',
    group: 'Catalog',
    resourceCategory: 'BRANDS',
    defaultStatus: 'AVAILABLE',
    requiredScope: 'store_v2_products_read_only',
    apiSurface: 'GET /v3/catalog/brands',
    isWrite: false,
    channelApplicable: false,
    planDependency: null,
    requiresConfirmation: false,
    isReversible: true,
    unavailableReason: null,
    note: 'Brand ids are store-local.',
    docsPath: '/api-reference/store-management/catalog',
  }),
  'brands.manage': D({
    key: 'brands.manage',
    label: 'Manage brands',
    group: 'Catalog',
    resourceCategory: 'BRANDS',
    defaultStatus: 'NOT_IMPLEMENTED',
    requiredScope: 'store_v2_products',
    readScope: 'store_v2_products_read_only',
    apiSurface: 'POST/PUT /v3/catalog/brands',
    isWrite: true,
    channelApplicable: false,
    planDependency: null,
    requiresConfirmation: true,
    isReversible: false,
    unavailableReason: 'Not enabled in this release.',
    note: 'Brands are referenced by id from products, so ordering matters when copying a catalog.',
    docsPath: '/api-reference/store-management/catalog',
  }),

  // -------------------------------------------------------------------------
  // Pricing
  // -------------------------------------------------------------------------
  'price_lists.read': D({
    key: 'price_lists.read',
    label: 'Read price lists',
    group: 'Pricing',
    resourceCategory: 'PRICE_LISTS',
    defaultStatus: 'AVAILABLE',
    requiredScope: 'store_v2_products_read_only',
    apiSurface: 'GET /v3/pricelists, GET /v3/pricelists/{id}/records',
    isWrite: false,
    channelApplicable: true,
    planDependency: 'Price-list capacity varies by plan.',
    requiresConfirmation: false,
    isReversible: true,
    unavailableReason: null,
    note: 'Price lists are how per-currency, per-channel and per-group pricing is expressed.',
    docsPath: '/api-reference/store-management/price-lists',
  }),
  'price_lists.manage': D({
    key: 'price_lists.manage',
    label: 'Manage price lists',
    group: 'Pricing',
    resourceCategory: 'PRICE_LISTS',
    defaultStatus: 'NOT_IMPLEMENTED',
    requiredScope: 'store_v2_products',
    readScope: 'store_v2_products_read_only',
    apiSurface: 'POST/PUT /v3/pricelists, PUT /v3/pricelists/{id}/records',
    isWrite: true,
    channelApplicable: true,
    planDependency: 'Price-list capacity varies by plan.',
    requiresConfirmation: true,
    isReversible: false,
    unavailableReason: 'Not enabled in this release. Pricing deployments produce a plan only.',
    note: 'Price records are keyed by variant id, which differs per store — mapping is mandatory.',
    docsPath: '/api-reference/store-management/price-lists',
  }),
  'pricing.update': D({
    key: 'pricing.update',
    label: 'Update product pricing',
    group: 'Pricing',
    resourceCategory: 'PRICING',
    defaultStatus: 'NOT_IMPLEMENTED',
    requiredScope: 'store_v2_products',
    readScope: 'store_v2_products_read_only',
    apiSurface: 'PUT /v3/catalog/products/{product_id}',
    isWrite: true,
    channelApplicable: false,
    planDependency: null,
    requiresConfirmation: true,
    isReversible: false,
    unavailableReason: 'Not enabled in this release.',
    note: 'The product record holds a single base price in the store currency. Per-channel prices belong in price lists.',
    docsPath: '/api-reference/store-management/catalog',
  }),

  // -------------------------------------------------------------------------
  // Inventory
  // -------------------------------------------------------------------------
  'inventory.read': D({
    key: 'inventory.read',
    label: 'Read inventory',
    group: 'Inventory',
    resourceCategory: 'INVENTORY_SETTINGS',
    defaultStatus: 'AVAILABLE',
    requiredScope: 'store_inventory_read_only',
    apiSurface: 'GET /v3/inventory/items, GET /v3/inventory/locations/{id}/items',
    isWrite: false,
    channelApplicable: false,
    planDependency: 'Multi-location inventory depends on plan.',
    requiresConfirmation: false,
    isReversible: true,
    unavailableReason: null,
    note: 'Falls back to product-level inventory_level when the Inventory API is unavailable.',
    docsPath: '/api-reference/store-management/inventory',
  }),
  'inventory.update': D({
    key: 'inventory.update',
    label: 'Update inventory',
    group: 'Inventory',
    resourceCategory: 'INVENTORY_SETTINGS',
    defaultStatus: 'NOT_IMPLEMENTED',
    requiredScope: 'store_inventory',
    readScope: 'store_inventory_read_only',
    apiSurface: 'PUT /v3/inventory/adjustments/absolute, POST /v3/inventory/adjustments/relative',
    isWrite: true,
    channelApplicable: false,
    planDependency: 'Multi-location inventory depends on plan.',
    requiresConfirmation: true,
    isReversible: false,
    unavailableReason:
      'Not enabled in this release. Inventory writes affect what customers can buy, so they stay behind explicit per-store verification.',
    note: 'Independent stores never share physical stock. Treat every quantity as store-local unless an external system owns it.',
    docsPath: '/api-reference/store-management/inventory',
  }),
  'inventory_locations.read': D({
    key: 'inventory_locations.read',
    label: 'Read inventory locations',
    group: 'Inventory',
    resourceCategory: 'INVENTORY_SETTINGS',
    defaultStatus: 'AVAILABLE',
    requiredScope: 'store_locations_read_only',
    apiSurface: 'GET /v3/inventory/locations',
    isWrite: false,
    channelApplicable: false,
    planDependency: 'Multi-location inventory depends on plan.',
    requiresConfirmation: false,
    isReversible: true,
    unavailableReason: null,
    note: 'Stores without multi-location inventory report a single default location.',
    docsPath: '/api-reference/store-management/inventory',
  }),

  // -------------------------------------------------------------------------
  // Orders
  // -------------------------------------------------------------------------
  'orders.read': D({
    key: 'orders.read',
    label: 'Read orders',
    group: 'Orders',
    resourceCategory: 'STORE_SETTINGS',
    defaultStatus: 'AVAILABLE',
    requiredScope: 'store_v2_orders_read_only',
    apiSurface: 'GET /v2/orders, GET /v2/orders/{id}/products',
    isWrite: false,
    channelApplicable: true,
    planDependency: null,
    requiresConfirmation: false,
    isReversible: true,
    unavailableReason: null,
    note: 'Personal data is masked at the provider boundary before it reaches storage or the UI.',
    docsPath: '/api-reference/store-management/orders',
  }),
  'orders.update_status': D({
    key: 'orders.update_status',
    label: 'Update order status',
    group: 'Orders',
    resourceCategory: 'STORE_SETTINGS',
    defaultStatus: 'NOT_IMPLEMENTED',
    requiredScope: 'store_v2_orders',
    readScope: 'store_v2_orders_read_only',
    apiSurface: 'PUT /v2/orders/{id}',
    isWrite: true,
    channelApplicable: false,
    planDependency: null,
    requiresConfirmation: true,
    isReversible: false,
    unavailableReason:
      'Not enabled in this release. Order status changes trigger customer emails and fulfilment side effects, so they open in the BigCommerce control panel instead.',
    note: 'Status transitions are not freely reversible and can dispatch notifications.',
    docsPath: '/api-reference/store-management/orders',
  }),
  'orders.create_refund': D({
    key: 'orders.create_refund',
    label: 'Create refunds',
    group: 'Orders',
    resourceCategory: 'STORE_SETTINGS',
    defaultStatus: 'MANUAL_ACTION',
    requiredScope: 'store_v2_orders',
    readScope: 'store_v2_orders_read_only',
    apiSurface: 'POST /v3/orders/{order_id}/payment_actions/refunds',
    isWrite: true,
    channelApplicable: false,
    planDependency: 'Refund support depends on the payment gateway.',
    requiresConfirmation: true,
    isReversible: false,
    unavailableReason:
      'Refunds move real money and cannot be undone. This platform will not issue them; it links to the order in the BigCommerce control panel.',
    note: 'Deliberately excluded from automation. Refund quotes and history are read-only here.',
    docsPath: '/api-reference/store-management/orders',
  }),
  'orders.read_transactions': D({
    key: 'orders.read_transactions',
    label: 'Read order transactions',
    group: 'Orders',
    resourceCategory: 'STORE_SETTINGS',
    defaultStatus: 'READ_ONLY',
    requiredScope: 'store_v2_transactions_read_only',
    apiSurface: 'GET /v3/orders/{order_id}/transactions',
    isWrite: false,
    channelApplicable: false,
    planDependency: null,
    requiresConfirmation: false,
    isReversible: true,
    unavailableReason: null,
    note: 'Only gateway status and amount are surfaced. No card data is read, stored or displayed.',
    docsPath: '/api-reference/store-management/orders',
  }),
  'orders.read_fulfilments': D({
    key: 'orders.read_fulfilments',
    label: 'Read fulfilment details',
    group: 'Orders',
    resourceCategory: 'STORE_SETTINGS',
    defaultStatus: 'READ_ONLY',
    requiredScope: 'store_order_fulfillment_read_only',
    apiSurface: 'GET /v2/orders/{id}/shipments',
    isWrite: false,
    channelApplicable: false,
    planDependency: null,
    requiresConfirmation: false,
    isReversible: true,
    unavailableReason: null,
    note: 'Shipment records are read for the order timeline.',
    docsPath: '/api-reference/store-management/orders',
  }),

  // -------------------------------------------------------------------------
  // Customers
  // -------------------------------------------------------------------------
  'customers.read': D({
    key: 'customers.read',
    label: 'Read customers',
    group: 'Customers',
    resourceCategory: 'CUSTOMER_GROUPS',
    defaultStatus: 'AVAILABLE',
    requiredScope: 'store_v2_customers_read_only',
    apiSurface: 'GET /v3/customers',
    isWrite: false,
    channelApplicable: true,
    planDependency: null,
    requiresConfirmation: false,
    isReversible: true,
    unavailableReason: null,
    note: 'Emails are masked and hashed at the boundary. Full personal data is fetched on demand and never persisted.',
    docsPath: '/api-reference/store-management/customers-v3',
  }),
  'customers.manage': D({
    key: 'customers.manage',
    label: 'Manage customers',
    group: 'Customers',
    resourceCategory: 'CUSTOMER_GROUPS',
    defaultStatus: 'NOT_IMPLEMENTED',
    requiredScope: 'store_v2_customers',
    readScope: 'store_v2_customers_read_only',
    apiSurface: 'POST/PUT /v3/customers',
    isWrite: true,
    channelApplicable: false,
    planDependency: null,
    requiresConfirmation: true,
    isReversible: false,
    unavailableReason:
      'Not enabled. Copying customer records between stores would duplicate personal data across legal entities, which this platform will not do automatically.',
    note: 'Customer identities are never merged across stores. See docs/security.md.',
    docsPath: '/api-reference/store-management/customers-v3',
  }),
  'customer_groups.read': D({
    key: 'customer_groups.read',
    label: 'Read customer groups',
    group: 'Customers',
    resourceCategory: 'CUSTOMER_GROUPS',
    defaultStatus: 'AVAILABLE',
    requiredScope: 'store_v2_customers_read_only',
    apiSurface: 'GET /v2/customer_groups',
    isWrite: false,
    channelApplicable: false,
    planDependency: null,
    requiresConfirmation: false,
    isReversible: true,
    unavailableReason: null,
    note: 'Group ids are store-local and are always resolved through the mapping table.',
    docsPath: '/api-reference/store-management/customers-v2',
  }),
  'customer_groups.manage': D({
    key: 'customer_groups.manage',
    label: 'Manage customer groups',
    group: 'Customers',
    resourceCategory: 'CUSTOMER_GROUPS',
    defaultStatus: 'NOT_IMPLEMENTED',
    requiredScope: 'store_v2_customers',
    readScope: 'store_v2_customers_read_only',
    apiSurface: 'POST/PUT /v2/customer_groups',
    isWrite: true,
    channelApplicable: false,
    planDependency: null,
    requiresConfirmation: true,
    isReversible: false,
    unavailableReason:
      'Not enabled in this release. Group templates can be modelled, compared and dry-run against every store.',
    note: 'Creating a group in a target store produces a new numeric id, recorded in CustomerGroupMapping.',
    docsPath: '/api-reference/store-management/customers-v2',
  }),

  // -------------------------------------------------------------------------
  // Content
  // -------------------------------------------------------------------------
  'pages.read': D({
    key: 'pages.read',
    label: 'Read pages',
    group: 'Content',
    resourceCategory: 'PAGES',
    defaultStatus: 'AVAILABLE',
    requiredScope: 'store_v2_content_read_only',
    apiSurface: 'GET /v3/content/pages',
    isWrite: false,
    channelApplicable: true,
    planDependency: null,
    requiresConfirmation: false,
    isReversible: true,
    unavailableReason: null,
    note: 'Pages carry a channel id in Multi-Storefront stores.',
    docsPath: '/api-reference/store-management/pages',
  }),
  'pages.manage': D({
    key: 'pages.manage',
    label: 'Manage pages',
    group: 'Content',
    resourceCategory: 'PAGES',
    defaultStatus: 'NOT_IMPLEMENTED',
    requiredScope: 'store_v2_content',
    readScope: 'store_v2_content_read_only',
    apiSurface: 'POST/PUT /v3/content/pages',
    isWrite: true,
    channelApplicable: true,
    planDependency: null,
    requiresConfirmation: true,
    isReversible: false,
    unavailableReason: 'Not enabled in this release. Content deployments produce a plan only.',
    note: 'Page URLs must be unique per channel; collisions surface as conflicts during dry-run.',
    docsPath: '/api-reference/store-management/pages',
  }),
  'widgets.read': D({
    key: 'widgets.read',
    label: 'Read widgets',
    group: 'Content',
    resourceCategory: 'WIDGETS',
    defaultStatus: 'AVAILABLE',
    requiredScope: 'store_v2_content_read_only',
    apiSurface: 'GET /v3/content/widgets, GET /v3/content/placements',
    isWrite: false,
    channelApplicable: true,
    planDependency: null,
    requiresConfirmation: false,
    isReversible: true,
    unavailableReason: null,
    note: 'Placements bind a widget to a channel and a theme template file.',
    docsPath: '/api-reference/store-management/widgets',
  }),
  'widgets.manage': D({
    key: 'widgets.manage',
    label: 'Manage widgets',
    group: 'Content',
    resourceCategory: 'WIDGETS',
    defaultStatus: 'NOT_IMPLEMENTED',
    requiredScope: 'store_v2_content',
    readScope: 'store_v2_content_read_only',
    apiSurface: 'POST/PUT /v3/content/widgets, /v3/content/placements',
    isWrite: true,
    channelApplicable: true,
    planDependency: null,
    requiresConfirmation: true,
    isReversible: false,
    unavailableReason: 'Not enabled in this release.',
    note: 'A widget cannot be placed unless the target theme exposes the same template region.',
    docsPath: '/api-reference/store-management/widgets',
  }),
  'redirects.read': D({
    key: 'redirects.read',
    label: 'Read redirects',
    group: 'Content',
    resourceCategory: 'REDIRECTS',
    defaultStatus: 'AVAILABLE',
    requiredScope: 'store_v2_content_read_only',
    apiSurface: 'GET /v3/storefront/redirects',
    isWrite: false,
    channelApplicable: true,
    planDependency: null,
    requiresConfirmation: false,
    isReversible: true,
    unavailableReason: null,
    note: 'Redirects are scoped to a site, which corresponds to a channel.',
    docsPath: '/api-reference/store-management/redirects',
  }),
  'redirects.manage': D({
    key: 'redirects.manage',
    label: 'Manage redirects',
    group: 'Content',
    resourceCategory: 'REDIRECTS',
    defaultStatus: 'NOT_IMPLEMENTED',
    requiredScope: 'store_v2_content',
    readScope: 'store_v2_content_read_only',
    apiSurface: 'PUT/POST /v3/storefront/redirects',
    isWrite: true,
    channelApplicable: true,
    planDependency: null,
    requiresConfirmation: true,
    isReversible: true,
    unavailableReason: 'Not enabled in this release.',
    note: 'Redirect paths are site-relative, so copying between stores requires domain-aware rewriting.',
    docsPath: '/api-reference/store-management/redirects',
  }),
  'scripts.read': D({
    key: 'scripts.read',
    label: 'Read scripts',
    group: 'Content',
    resourceCategory: 'SCRIPTS',
    defaultStatus: 'AVAILABLE',
    requiredScope: 'store_v2_content_read_only',
    apiSurface: 'GET /v3/content/scripts',
    isWrite: false,
    channelApplicable: true,
    planDependency: null,
    requiresConfirmation: false,
    isReversible: true,
    unavailableReason: null,
    note: 'An API account can only see and modify the scripts it created.',
    docsPath: '/api-reference/store-management/scripts',
  }),
  'scripts.manage': D({
    key: 'scripts.manage',
    label: 'Manage scripts',
    group: 'Content',
    resourceCategory: 'SCRIPTS',
    defaultStatus: 'NOT_IMPLEMENTED',
    requiredScope: 'store_v2_content',
    readScope: 'store_v2_content_read_only',
    apiSurface: 'POST/PUT /v3/content/scripts',
    isWrite: true,
    channelApplicable: true,
    planDependency: null,
    requiresConfirmation: true,
    isReversible: true,
    unavailableReason:
      'Not enabled in this release. Copying analytics or consent scripts between stores can double-count traffic or breach local consent rules.',
    note: 'Scripts created by another API account are invisible to this one and can never be modified by it.',
    docsPath: '/api-reference/store-management/scripts',
  }),
  'banners.manage': D({
    key: 'banners.manage',
    label: 'Manage banners',
    group: 'Content',
    resourceCategory: 'BANNERS',
    defaultStatus: 'MANUAL_ACTION',
    requiredScope: 'store_v2_content',
    apiSurface: 'No dedicated public banners API on current storefronts',
    isWrite: true,
    channelApplicable: false,
    planDependency: null,
    requiresConfirmation: true,
    isReversible: true,
    unavailableReason:
      'Modern BigCommerce storefronts model promotional banners as widgets rather than a standalone banner resource.',
    note: 'Raised as a manual action with the intended value recorded, so the change is still tracked and audited.',
    docsPath: '/api-reference/store-management/widgets',
  }),
  'navigation.manage': D({
    key: 'navigation.manage',
    label: 'Manage navigation',
    group: 'Content',
    resourceCategory: 'NAVIGATION',
    defaultStatus: 'NOT_SUPPORTED',
    requiredScope: null,
    apiSurface: 'None — navigation derives from the category tree and theme settings',
    isWrite: true,
    channelApplicable: true,
    planDependency: null,
    requiresConfirmation: false,
    isReversible: true,
    unavailableReason:
      'BigCommerce has no standalone navigation resource. Storefront navigation comes from the category tree, page visibility and theme configuration.',
    note: 'Manage the underlying category tree and theme settings instead.',
    docsPath: '/docs/storefront/themes',
  }),

  // -------------------------------------------------------------------------
  // Themes
  // -------------------------------------------------------------------------
  'themes.read': D({
    key: 'themes.read',
    label: 'Read themes',
    group: 'Themes',
    resourceCategory: 'THEMES',
    defaultStatus: 'AVAILABLE',
    requiredScope: 'store_themes_read_only',
    apiSurface: 'GET /v3/themes',
    isWrite: false,
    channelApplicable: true,
    planDependency: null,
    requiresConfirmation: false,
    isReversible: true,
    unavailableReason: null,
    note: 'Reports installed themes, their versions and which variation is active.',
    docsPath: '/api-reference/store-management/themes',
  }),
  'themes.upload': D({
    key: 'themes.upload',
    label: 'Upload themes',
    group: 'Themes',
    resourceCategory: 'THEMES',
    defaultStatus: 'NOT_IMPLEMENTED',
    requiredScope: 'store_themes_manage',
    readScope: 'store_themes_read_only',
    apiSurface: 'POST /v3/themes (multipart) then poll the returned job',
    isWrite: true,
    channelApplicable: false,
    planDependency: 'Each store keeps a limited number of custom themes.',
    requiresConfirmation: true,
    isReversible: true,
    unavailableReason:
      'Not enabled in this release. Theme releases are modelled, compared and deployed as simulated jobs.',
    note: 'Uploads are asynchronous: the API returns a job that must be polled to completion.',
    docsPath: '/api-reference/store-management/themes',
  }),
  'themes.activate': D({
    key: 'themes.activate',
    label: 'Activate themes',
    group: 'Themes',
    resourceCategory: 'THEMES',
    defaultStatus: 'NOT_IMPLEMENTED',
    requiredScope: 'store_themes_manage',
    readScope: 'store_themes_read_only',
    apiSurface: 'POST /v3/themes/actions/activate',
    isWrite: true,
    channelApplicable: true,
    planDependency: null,
    requiresConfirmation: true,
    isReversible: true,
    unavailableReason:
      'Not enabled in this release. Activation changes the live storefront immediately for every visitor.',
    note: 'Rollback is possible because the previous theme remains installed, provided the store has a free theme slot.',
    docsPath: '/api-reference/store-management/themes',
  }),
  'theme_config.read': D({
    key: 'theme_config.read',
    label: 'Read theme configuration',
    group: 'Themes',
    resourceCategory: 'THEME_CONFIGURATION',
    defaultStatus: 'READ_ONLY',
    requiredScope: 'store_themes_read_only',
    apiSurface: 'GET /v3/themes/{uuid}/configurations',
    isWrite: false,
    channelApplicable: true,
    planDependency: null,
    requiresConfirmation: false,
    isReversible: true,
    unavailableReason: null,
    note: 'Configuration keys are theme-specific and differ between theme versions.',
    docsPath: '/api-reference/store-management/themes',
  }),
  'theme_config.manage': D({
    key: 'theme_config.manage',
    label: 'Manage theme configuration',
    group: 'Themes',
    resourceCategory: 'THEME_CONFIGURATION',
    defaultStatus: 'NOT_IMPLEMENTED',
    requiredScope: 'store_themes_manage',
    readScope: 'store_themes_read_only',
    apiSurface: 'Theme configuration endpoints',
    isWrite: true,
    channelApplicable: true,
    planDependency: null,
    requiresConfirmation: true,
    isReversible: true,
    unavailableReason: 'Not enabled in this release.',
    note: 'Copying configuration between incompatible theme versions silently drops unknown keys, so it is blocked unless versions match.',
    docsPath: '/api-reference/store-management/themes',
  }),

  // -------------------------------------------------------------------------
  // Channels and storefronts
  // -------------------------------------------------------------------------
  'channels.read': D({
    key: 'channels.read',
    label: 'Read channels',
    group: 'Storefronts',
    resourceCategory: 'STORE_SETTINGS',
    defaultStatus: 'AVAILABLE',
    requiredScope: 'store_channel_settings_read_only',
    apiSurface: 'GET /v3/channels, GET /v3/channels/{id}/site',
    isWrite: false,
    channelApplicable: false,
    planDependency: null,
    requiresConfirmation: false,
    isReversible: true,
    unavailableReason: null,
    note: 'Every store reports at least one channel, even without Multi-Storefront.',
    docsPath: '/api-reference/store-management/channels',
  }),
  'channels.create': D({
    key: 'channels.create',
    label: 'Create storefront channels',
    group: 'Storefronts',
    resourceCategory: 'STORE_SETTINGS',
    defaultStatus: 'PLAN_DEPENDENT',
    requiredScope: 'store_channel_settings',
    readScope: 'store_channel_settings_read_only',
    apiSurface: 'POST /v3/channels',
    isWrite: true,
    channelApplicable: false,
    planDependency:
      'Requires Multi-Storefront and an available storefront seat on the store plan. Creating a channel can have billing consequences.',
    requiresConfirmation: true,
    isReversible: false,
    unavailableReason:
      'Only offered where the connected store reports Multi-Storefront support and spare storefront capacity. Execution is simulated in this release; the wizard produces a preflight report and a task list.',
    note: 'A channel needs a matching site and routes before it serves traffic. Storefront seats are a commercial entitlement — confirm with your BigCommerce account team.',
    docsPath: '/api-reference/store-management/channels',
  }),
  'channels.manage': D({
    key: 'channels.manage',
    label: 'Manage channels',
    group: 'Storefronts',
    resourceCategory: 'STORE_SETTINGS',
    defaultStatus: 'NOT_IMPLEMENTED',
    requiredScope: 'store_channel_settings',
    readScope: 'store_channel_settings_read_only',
    apiSurface: 'PUT /v3/channels/{channel_id}',
    isWrite: true,
    channelApplicable: true,
    planDependency: 'Requires Multi-Storefront.',
    requiresConfirmation: true,
    isReversible: true,
    unavailableReason: 'Not enabled in this release.',
    note: 'Deactivating a channel takes a storefront offline.',
    docsPath: '/api-reference/store-management/channels',
  }),
  'sites.read': D({
    key: 'sites.read',
    label: 'Read sites and routes',
    group: 'Storefronts',
    resourceCategory: 'STORE_SETTINGS',
    defaultStatus: 'AVAILABLE',
    requiredScope: 'store_sites_read_only',
    apiSurface: 'GET /v3/sites, GET /v3/sites/{site_id}/routes',
    isWrite: false,
    channelApplicable: true,
    planDependency: null,
    requiresConfirmation: false,
    isReversible: true,
    unavailableReason: null,
    note: 'A site binds a channel to a URL.',
    docsPath: '/api-reference/store-management/sites',
  }),
  'sites.manage': D({
    key: 'sites.manage',
    label: 'Manage sites and routes',
    group: 'Storefronts',
    resourceCategory: 'STORE_SETTINGS',
    defaultStatus: 'NOT_IMPLEMENTED',
    requiredScope: 'store_sites',
    readScope: 'store_sites_read_only',
    apiSurface: 'POST/PUT /v3/sites',
    isWrite: true,
    channelApplicable: true,
    planDependency: null,
    requiresConfirmation: true,
    isReversible: false,
    unavailableReason: 'Not enabled in this release.',
    note: 'Changing a site URL affects live traffic and SEO.',
    docsPath: '/api-reference/store-management/sites',
  }),
  'storefront_settings.read': D({
    key: 'storefront_settings.read',
    label: 'Read storefront settings',
    group: 'Storefronts',
    resourceCategory: 'STORE_SETTINGS',
    defaultStatus: 'AVAILABLE',
    requiredScope: 'store_v2_information_read_only',
    apiSurface: 'GET /v2/store, GET /v3/settings/store/profile',
    isWrite: false,
    channelApplicable: true,
    planDependency: null,
    requiresConfirmation: false,
    isReversible: true,
    unavailableReason: null,
    note: 'A meaningful subset of control-panel settings has no read API and shows as unavailable.',
    docsPath: '/api-reference/store-management/settings',
  }),
  'storefront_settings.manage': D({
    key: 'storefront_settings.manage',
    label: 'Manage storefront settings',
    group: 'Storefronts',
    resourceCategory: 'STORE_SETTINGS',
    defaultStatus: 'NOT_IMPLEMENTED',
    requiredScope: 'store_v2_information',
    readScope: 'store_v2_information_read_only',
    apiSurface: 'PUT /v3/settings/store/profile and related resources',
    isWrite: true,
    channelApplicable: true,
    planDependency: null,
    requiresConfirmation: true,
    isReversible: true,
    unavailableReason: 'Not enabled in this release. Unsupported settings are raised as manual actions.',
    note: 'Not every control-panel setting is exposed by a public API — those become checklist items.',
    docsPath: '/api-reference/store-management/settings',
  }),
  'locales.read': D({
    key: 'locales.read',
    label: 'Read channel locales',
    group: 'Storefronts',
    resourceCategory: 'LOCALE_CONFIGURATION',
    defaultStatus: 'READ_ONLY',
    requiredScope: 'store_channel_settings_read_only',
    apiSurface: 'GET /v3/channels/{channel_id}/locales',
    isWrite: false,
    channelApplicable: true,
    planDependency: 'Multi-language storefronts depend on plan and theme support.',
    requiresConfirmation: false,
    isReversible: true,
    unavailableReason: null,
    note: 'Reported per channel, not per store.',
    docsPath: '/api-reference/store-management/channels',
  }),
  'locales.manage': D({
    key: 'locales.manage',
    label: 'Manage channel locales',
    group: 'Storefronts',
    resourceCategory: 'LOCALE_CONFIGURATION',
    defaultStatus: 'NOT_IMPLEMENTED',
    requiredScope: 'store_channel_settings',
    readScope: 'store_channel_settings_read_only',
    apiSurface: 'PUT /v3/channels/{channel_id}/locales',
    isWrite: true,
    channelApplicable: true,
    planDependency: 'Multi-language storefronts depend on plan and theme support.',
    requiresConfirmation: true,
    isReversible: true,
    unavailableReason: 'Not enabled in this release.',
    note: 'Adding a locale without translated content degrades the storefront.',
    docsPath: '/api-reference/store-management/channels',
  }),

  // -------------------------------------------------------------------------
  // Marketing
  // -------------------------------------------------------------------------
  'promotions.read': D({
    key: 'promotions.read',
    label: 'Read promotions',
    group: 'Marketing',
    resourceCategory: 'PROMOTIONS',
    defaultStatus: 'AVAILABLE',
    requiredScope: 'store_v2_marketing_read_only',
    apiSurface: 'GET /v3/promotions, GET /v3/promotions/coupons',
    isWrite: false,
    channelApplicable: true,
    planDependency: null,
    requiresConfirmation: false,
    isReversible: true,
    unavailableReason: null,
    note: 'Promotion rule shapes vary; complex rules are summarised rather than fully modelled.',
    docsPath: '/api-reference/store-management/promotions',
  }),
  'promotions.manage': D({
    key: 'promotions.manage',
    label: 'Manage promotions',
    group: 'Marketing',
    resourceCategory: 'PROMOTIONS',
    defaultStatus: 'NOT_IMPLEMENTED',
    requiredScope: 'store_v2_marketing',
    readScope: 'store_v2_marketing_read_only',
    apiSurface: 'POST/PUT /v3/promotions',
    isWrite: true,
    channelApplicable: true,
    planDependency: null,
    requiresConfirmation: true,
    isReversible: true,
    unavailableReason:
      'Not enabled in this release. Only promotions whose rules can be round-tripped without loss would ever be copied.',
    note: 'Promotion rules reference store-local product, category and customer-group ids.',
    docsPath: '/api-reference/store-management/promotions',
  }),

  // -------------------------------------------------------------------------
  // Commerce configuration
  // -------------------------------------------------------------------------
  'shipping.read': D({
    key: 'shipping.read',
    label: 'Read shipping configuration',
    group: 'Configuration',
    resourceCategory: 'SHIPPING_CONFIGURATION',
    defaultStatus: 'READ_ONLY',
    requiredScope: 'store_v2_information_read_only',
    apiSurface: 'GET /v2/shipping/zones, GET /v2/shipping/zones/{id}/methods',
    isWrite: false,
    channelApplicable: false,
    planDependency: null,
    requiresConfirmation: false,
    isReversible: true,
    unavailableReason: null,
    note: 'Carrier connections require carrier account credentials and are never read by this platform.',
    docsPath: '/api-reference/store-management/shipping-v2',
  }),
  'shipping.manage': D({
    key: 'shipping.manage',
    label: 'Manage shipping configuration',
    group: 'Configuration',
    resourceCategory: 'SHIPPING_CONFIGURATION',
    defaultStatus: 'MANUAL_ACTION',
    requiredScope: 'store_v2_information',
    readScope: 'store_v2_information_read_only',
    apiSurface: 'POST/PUT /v2/shipping/zones',
    isWrite: true,
    channelApplicable: false,
    planDependency: null,
    requiresConfirmation: true,
    isReversible: false,
    unavailableReason:
      'Shipping zones reference country and state codes that differ per market, and carrier connections cannot be automated at all. Copied configuration is raised as a reviewed manual action.',
    note: 'Getting shipping wrong stops orders or loses money on every parcel, so it stays a human decision.',
    docsPath: '/api-reference/store-management/shipping-v2',
  }),
  'checkout_settings.read': D({
    key: 'checkout_settings.read',
    label: 'Read checkout settings',
    group: 'Configuration',
    resourceCategory: 'CHECKOUT_SETTINGS',
    defaultStatus: 'READ_ONLY',
    requiredScope: 'store_v2_information_read_only',
    apiSurface: 'GET /v3/settings — checkout-related resources',
    isWrite: false,
    channelApplicable: true,
    planDependency: null,
    requiresConfirmation: false,
    isReversible: true,
    unavailableReason: null,
    note: 'Payment-gateway configuration and credentials are out of scope entirely.',
    docsPath: '/api-reference/store-management/settings',
  }),
  'checkout_settings.manage': D({
    key: 'checkout_settings.manage',
    label: 'Manage checkout settings',
    group: 'Configuration',
    resourceCategory: 'CHECKOUT_SETTINGS',
    defaultStatus: 'MANUAL_ACTION',
    requiredScope: 'store_v2_information',
    readScope: 'store_v2_information_read_only',
    apiSurface: 'Partial coverage in Settings API v3',
    isWrite: true,
    channelApplicable: true,
    planDependency: null,
    requiresConfirmation: true,
    isReversible: true,
    unavailableReason:
      'Checkout behaviour is only partially exposed by public APIs, and a wrong setting can stop conversion outright.',
    note: 'This platform never touches payment-gateway credentials.',
    docsPath: '/api-reference/store-management/settings',
  }),
  'tax.read': D({
    key: 'tax.read',
    label: 'Read tax configuration',
    group: 'Configuration',
    resourceCategory: 'TAX_CONFIGURATION',
    defaultStatus: 'READ_ONLY',
    requiredScope: 'store_v2_information_read_only',
    apiSurface: 'GET /v3/tax/settings, /v3/tax/zones, /v3/tax/rates',
    isWrite: false,
    channelApplicable: false,
    planDependency: 'Automatic tax may be provided by a third party such as Avalara.',
    requiresConfirmation: false,
    isReversible: true,
    unavailableReason: null,
    note: 'Where a third-party tax provider is active, BigCommerce is not the source of truth.',
    docsPath: '/api-reference/store-management/tax',
  }),
  'tax.manage': D({
    key: 'tax.manage',
    label: 'Manage tax configuration',
    group: 'Configuration',
    resourceCategory: 'TAX_CONFIGURATION',
    defaultStatus: 'MANUAL_ACTION',
    requiredScope: 'store_v2_information',
    readScope: 'store_v2_information_read_only',
    apiSurface: 'PUT /v3/tax/rates, /v3/tax/zones',
    isWrite: true,
    channelApplicable: false,
    planDependency: null,
    requiresConfirmation: true,
    isReversible: false,
    unavailableReason:
      'Tax configuration carries legal and financial risk and varies per jurisdiction. It is never copied automatically between stores.',
    note: 'Differences are reported so a tax owner can act on them deliberately.',
    docsPath: '/api-reference/store-management/tax',
  }),
  'currencies.read': D({
    key: 'currencies.read',
    label: 'Read currencies',
    group: 'Configuration',
    resourceCategory: 'CURRENCY_CONFIGURATION',
    defaultStatus: 'READ_ONLY',
    requiredScope: 'store_v2_information_read_only',
    apiSurface: 'GET /v2/currencies',
    isWrite: false,
    channelApplicable: false,
    planDependency: 'Multi-currency support depends on plan.',
    requiresConfirmation: false,
    isReversible: true,
    unavailableReason: null,
    note: 'Reports enabled currencies, display formatting and which is transactional.',
    docsPath: '/api-reference/store-management/currency-v2',
  }),
  'currencies.manage': D({
    key: 'currencies.manage',
    label: 'Manage currencies',
    group: 'Configuration',
    resourceCategory: 'CURRENCY_CONFIGURATION',
    defaultStatus: 'MANUAL_ACTION',
    requiredScope: 'store_v2_information',
    readScope: 'store_v2_information_read_only',
    apiSurface: 'POST/PUT /v2/currencies',
    isWrite: true,
    channelApplicable: false,
    planDependency: 'Multi-currency support depends on plan.',
    requiresConfirmation: true,
    isReversible: false,
    unavailableReason:
      "A store's default transactional currency cannot be changed after setup, and adding currencies affects pricing, tax and settlement.",
    note: 'Adding a display currency is possible in the control panel; this platform records the intent as a manual action.',
    docsPath: '/api-reference/store-management/currency-v2',
  }),
  'domains.manage': D({
    key: 'domains.manage',
    label: 'Manage domains',
    group: 'Configuration',
    resourceCategory: 'STORE_SETTINGS',
    defaultStatus: 'NOT_SUPPORTED',
    requiredScope: null,
    apiSurface: 'None — domains and DNS are managed outside the store APIs',
    isWrite: true,
    channelApplicable: true,
    planDependency: null,
    requiresConfirmation: true,
    isReversible: false,
    unavailableReason:
      'Domain registration, DNS records and SSL provisioning are not manageable through the store management APIs. They involve your registrar and the BigCommerce control panel.',
    note: 'The launch checklist tracks these as manual steps with space for the DNS values.',
    docsPath: '/docs/storefront/deployment',
  }),
  'email_templates.read': D({
    key: 'email_templates.read',
    label: 'Read email templates',
    group: 'Configuration',
    resourceCategory: 'EMAIL_TEMPLATES',
    defaultStatus: 'READ_ONLY',
    requiredScope: 'store_v2_content_read_only',
    apiSurface: 'GET /v3/marketing/email-templates',
    isWrite: false,
    channelApplicable: true,
    planDependency: null,
    requiresConfirmation: false,
    isReversible: true,
    unavailableReason: null,
    note: 'Templates are per channel; available variables differ by email type.',
    docsPath: '/api-reference/store-management/email-templates',
  }),
  'email_templates.manage': D({
    key: 'email_templates.manage',
    label: 'Manage email templates',
    group: 'Configuration',
    resourceCategory: 'EMAIL_TEMPLATES',
    defaultStatus: 'NOT_IMPLEMENTED',
    requiredScope: 'store_v2_content',
    readScope: 'store_v2_content_read_only',
    apiSurface: 'PUT /v3/marketing/email-templates/{name}',
    isWrite: true,
    channelApplicable: true,
    planDependency: null,
    requiresConfirmation: true,
    isReversible: true,
    unavailableReason: 'Not enabled in this release.',
    note: 'Transactional email reaches customers directly, so changes are treated as high risk.',
    docsPath: '/api-reference/store-management/email-templates',
  }),

  // -------------------------------------------------------------------------
  // Platform
  // -------------------------------------------------------------------------
  'store_info.read': D({
    key: 'store_info.read',
    label: 'Read store information',
    group: 'Platform',
    resourceCategory: 'STORE_SETTINGS',
    defaultStatus: 'AVAILABLE',
    requiredScope: 'store_v2_information_read_only',
    apiSurface: 'GET /v2/store',
    isWrite: false,
    channelApplicable: false,
    planDependency: null,
    requiresConfirmation: false,
    isReversible: true,
    unavailableReason: null,
    note: 'The connection test uses this endpoint. It is the cheapest way to prove a token works.',
    docsPath: '/api-reference/store-management/store-information',
  }),
  'store_provisioning.create': D({
    key: 'store_provisioning.create',
    label: 'Provision a new BigCommerce store',
    group: 'Platform',
    resourceCategory: 'STORE_SETTINGS',
    defaultStatus: 'NOT_SUPPORTED',
    requiredScope: null,
    apiSurface: 'None — no public API creates a new BigCommerce store account',
    isWrite: true,
    channelApplicable: false,
    planDependency: 'New stores are a commercial arrangement with BigCommerce.',
    requiresConfirmation: true,
    isReversible: false,
    unavailableReason:
      'Creating an independent BigCommerce store is an account and billing operation, not a store-management API call. This platform provides guided provisioning: a checklist, a configuration template and a connection step once the store exists.',
    note: 'Use the guided provisioning workflow under Stores → Add store.',
    docsPath: '/docs/start/about',
  }),
};

export const CAPABILITY_LIST: CapabilityDefinition[] = CAPABILITY_KEYS.map(
  (key) => CAPABILITY_DEFINITIONS[key],
);

export function capabilityDefinition(key: string): CapabilityDefinition | undefined {
  return CAPABILITY_DEFINITIONS[key as CapabilityKey];
}

export function capabilityLabel(key: string): string {
  return capabilityDefinition(key)?.label ?? key;
}

export const CAPABILITY_GROUPS = [
  'Catalog',
  'Pricing',
  'Inventory',
  'Orders',
  'Customers',
  'Content',
  'Themes',
  'Storefronts',
  'Marketing',
  'Configuration',
  'Platform',
] as const;

/** All scopes this platform can make use of, for the connection wizard's guidance. */
export function allUsefulScopes(): { scope: string; usedBy: string[] }[] {
  const map = new Map<string, string[]>();
  for (const definition of CAPABILITY_LIST) {
    for (const scope of [definition.requiredScope, definition.readScope]) {
      if (!scope) continue;
      const existing = map.get(scope) ?? [];
      existing.push(definition.label);
      map.set(scope, existing);
    }
  }
  return [...map.entries()]
    .map(([scope, usedBy]) => ({ scope, usedBy: [...new Set(usedBy)].sort() }))
    .sort((a, b) => a.scope.localeCompare(b.scope));
}

/** Read scopes needed for the verified read-only feature set. */
export const MINIMUM_READ_SCOPES = [
  'store_v2_information_read_only',
  'store_v2_products_read_only',
  'store_v2_orders_read_only',
  'store_v2_customers_read_only',
  'store_v2_content_read_only',
  'store_channel_settings_read_only',
  'store_themes_read_only',
] as const;

/**
 * Resolves a capability's effective status for one store given the scopes the
 * token actually holds and what the store reports about itself.
 */
export function resolveCapabilityStatus(
  definition: CapabilityDefinition,
  context: {
    grantedScopes: string[] | null;
    multiStorefrontEnabled?: boolean | null;
    hasSpareStorefrontCapacity?: boolean | null;
    isDemo?: boolean;
  },
): { status: CapabilityStatus; reason: string | null } {
  const { grantedScopes, multiStorefrontEnabled, hasSpareStorefrontCapacity, isDemo } = context;

  // Structural impossibilities win over everything else.
  if (definition.defaultStatus === 'NOT_SUPPORTED') {
    return { status: 'NOT_SUPPORTED', reason: definition.unavailableReason };
  }

  // Multi-Storefront gating.
  if (definition.key === 'channels.create') {
    if (multiStorefrontEnabled === false) {
      return {
        status: 'PLAN_DEPENDENT',
        reason: 'This store does not report Multi-Storefront support, so it cannot host additional storefront channels.',
      };
    }
    if (hasSpareStorefrontCapacity === false) {
      return {
        status: 'PLAN_DEPENDENT',
        reason: 'Every storefront seat on this store plan is already in use.',
      };
    }
  }
  if (
    definition.channelApplicable &&
    multiStorefrontEnabled === false &&
    definition.key.startsWith('channels.')
  ) {
    return {
      status: 'PLAN_DEPENDENT',
      reason: 'Multi-Storefront is not enabled on this store.',
    };
  }

  // Scope checks, only when we actually know the granted scopes.
  //
  // An empty array means "could not be determined", not "none granted".
  // BigCommerce does not expose an endpoint that introspects an API account
  // token's scopes, so an unknown list is the normal case for a live store
  // until an operator records what they granted. Treating unknown as empty
  // would paint every capability as permission-missing, which is worse than
  // saying nothing.
  if (grantedScopes && grantedScopes.length > 0 && definition.requiredScope) {
    const hasWriteScope = grantedScopes.includes(definition.requiredScope);
    const hasReadScope = definition.readScope ? grantedScopes.includes(definition.readScope) : false;

    if (!hasWriteScope) {
      if (definition.isWrite && hasReadScope) {
        return {
          status: 'READ_ONLY',
          reason: `The API account holds ${definition.readScope} but not ${definition.requiredScope}, so this store can be read but not modified.`,
        };
      }
      if (!hasReadScope) {
        return {
          status: 'PERMISSION_MISSING',
          reason: `The API account is missing the ${definition.requiredScope} scope.`,
        };
      }
    }
  }

  // Demo connections can exercise the full modelled workflow, clearly labelled.
  if (isDemo && definition.defaultStatus === 'NOT_IMPLEMENTED') {
    return {
      status: 'NOT_IMPLEMENTED',
      reason: 'Simulated in demo mode. No BigCommerce store is contacted and nothing is written.',
    };
  }

  return { status: definition.defaultStatus, reason: definition.unavailableReason };
}

/** Capabilities that are safe to expose as an executable button. */
export function isOperational(status: CapabilityStatus): boolean {
  return status === 'AVAILABLE';
}

export function isReadable(status: CapabilityStatus): boolean {
  return status === 'AVAILABLE' || status === 'READ_ONLY';
}
