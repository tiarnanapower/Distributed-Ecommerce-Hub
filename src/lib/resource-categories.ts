/**
 * The resource categories that inheritance, comparison and deployment operate
 * on. Each entry records how the resource actually behaves on BigCommerce so
 * the UI never offers an operation the platform cannot honour.
 */
import type { AutomationLevel } from './enums';

export const RESOURCE_CATEGORIES = [
  'PRODUCTS',
  'CATEGORIES',
  'BRANDS',
  'PRICING',
  'PRICE_LISTS',
  'INVENTORY_SETTINGS',
  'CUSTOMER_GROUPS',
  'PROMOTIONS',
  'PAGES',
  'NAVIGATION',
  'WIDGETS',
  'BANNERS',
  'SCRIPTS',
  'REDIRECTS',
  'THEMES',
  'THEME_CONFIGURATION',
  'STORE_SETTINGS',
  'CHECKOUT_SETTINGS',
  'SHIPPING_CONFIGURATION',
  'TAX_CONFIGURATION',
  'CURRENCY_CONFIGURATION',
  'LOCALE_CONFIGURATION',
  'SEO_DEFAULTS',
  'EMAIL_TEMPLATES',
] as const;

export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number];

export interface ResourceCategoryMeta {
  key: ResourceCategory;
  label: string;
  /** Grouping used for navigation and settings screens. */
  group: 'Catalog' | 'Commerce' | 'Content' | 'Design' | 'Configuration';
  description: string;
  /** How much of this category can actually be automated through public APIs. */
  automation: AutomationLevel;
  /**
   * Whether the resource can genuinely differ per storefront channel inside a
   * single Multi-Storefront store. Where this is false the UI must not offer
   * per-channel variation.
   */
  channelVariable: boolean;
  /** Whether identifiers are store-local and therefore require mapping. */
  requiresMapping: boolean;
  /** Primary BigCommerce API surface, for documentation and capability checks. */
  apiSurface: string;
  /** Honest note about limits, shown as contextual help. */
  note: string;
}

export const RESOURCE_CATEGORY_META: Record<ResourceCategory, ResourceCategoryMeta> = {
  PRODUCTS: {
    key: 'PRODUCTS',
    label: 'Products',
    group: 'Catalog',
    description: 'Product records, variants, images, custom fields and channel assignments.',
    automation: 'AUTOMATED',
    channelVariable: false,
    requiresMapping: true,
    apiSurface: 'Catalog API v3 — /v3/catalog/products',
    note: 'Product data is shared by every channel in a Multi-Storefront store. Channels control visibility and listings, not the underlying product fields.',
  },
  CATEGORIES: {
    key: 'CATEGORIES',
    label: 'Categories',
    group: 'Catalog',
    description: 'Category trees and product-to-category assignments.',
    automation: 'AUTOMATED',
    channelVariable: true,
    requiresMapping: true,
    apiSurface: 'Catalog API v3 — /v3/catalog/trees, /v3/catalog/trees/categories',
    note: 'Multi-Storefront stores can assign a distinct category tree per channel. Independent stores have unrelated category ids.',
  },
  BRANDS: {
    key: 'BRANDS',
    label: 'Brands',
    group: 'Catalog',
    description: 'Brand records and their SEO metadata.',
    automation: 'AUTOMATED',
    channelVariable: false,
    requiresMapping: true,
    apiSurface: 'Catalog API v3 — /v3/catalog/brands',
    note: 'Brand ids are store-local.',
  },
  PRICING: {
    key: 'PRICING',
    label: 'Pricing',
    group: 'Commerce',
    description: 'Base price, sale price, retail price and cost on the product record.',
    automation: 'AUTOMATED',
    channelVariable: false,
    requiresMapping: true,
    apiSurface: 'Catalog API v3 — /v3/catalog/products',
    note: 'Per-channel and per-currency variation is expressed through price lists, not through the product record.',
  },
  PRICE_LISTS: {
    key: 'PRICE_LISTS',
    label: 'Price lists',
    group: 'Commerce',
    description: 'Price lists, price records and their customer-group assignments.',
    automation: 'AUTOMATED',
    channelVariable: true,
    requiresMapping: true,
    apiSurface: 'Price Lists API v3 — /v3/pricelists, /v3/pricelists/{id}/records',
    note: 'Price-list availability and the number of assignments can depend on plan.',
  },
  INVENTORY_SETTINGS: {
    key: 'INVENTORY_SETTINGS',
    label: 'Inventory settings',
    group: 'Commerce',
    description: 'Tracking mode, thresholds and safety-stock policy.',
    automation: 'PARTIAL',
    channelVariable: false,
    requiresMapping: true,
    apiSurface: 'Catalog API v3 and Inventory API v3 — /v3/inventory/locations, /v3/inventory/adjustments',
    note: 'Quantities are physical and store-specific. Independent stores never share stock unless an external system is the source of truth.',
  },
  CUSTOMER_GROUPS: {
    key: 'CUSTOMER_GROUPS',
    label: 'Customer groups',
    group: 'Commerce',
    description: 'Group definitions, discount rules and category access.',
    automation: 'AUTOMATED',
    channelVariable: false,
    requiresMapping: true,
    apiSurface: 'Customers API v2 — /v2/customer_groups',
    note: 'Numeric group ids differ per store. Cross-store operations always go through the mapping table.',
  },
  PROMOTIONS: {
    key: 'PROMOTIONS',
    label: 'Promotions',
    group: 'Commerce',
    description: 'Cart-level promotions, coupon codes and their channel assignment.',
    automation: 'PARTIAL',
    channelVariable: true,
    requiresMapping: true,
    apiSurface: 'Promotions API v3 — /v3/promotions, /v3/promotions/coupons',
    note: 'Rule shapes vary widely; this platform copies only promotions whose rules it can round-trip safely.',
  },
  PAGES: {
    key: 'PAGES',
    label: 'Pages',
    group: 'Content',
    description: 'Web pages and their per-channel visibility.',
    automation: 'AUTOMATED',
    channelVariable: true,
    requiresMapping: true,
    apiSurface: 'Content API v3 — /v3/content/pages',
    note: 'Pages carry a channel_id in Multi-Storefront stores.',
  },
  NAVIGATION: {
    key: 'NAVIGATION',
    label: 'Navigation',
    group: 'Content',
    description: 'Storefront navigation structure.',
    automation: 'PARTIAL',
    channelVariable: true,
    requiresMapping: false,
    apiSurface: 'Theme configuration and category visibility; no dedicated navigation API',
    note: 'BigCommerce navigation is derived from the category tree and theme settings rather than a standalone navigation resource.',
  },
  WIDGETS: {
    key: 'WIDGETS',
    label: 'Widgets',
    group: 'Content',
    description: 'Widget templates, widgets and their placements.',
    automation: 'AUTOMATED',
    channelVariable: true,
    requiresMapping: true,
    apiSurface: 'Widgets API v3 — /v3/content/widget-templates, /v3/content/widgets, /v3/content/placements',
    note: 'Placements are bound to a channel and a template file, so both must exist in the target.',
  },
  BANNERS: {
    key: 'BANNERS',
    label: 'Banners',
    group: 'Content',
    description: 'Storefront banners.',
    automation: 'PARTIAL',
    channelVariable: false,
    requiresMapping: true,
    apiSurface: 'Banners are managed in the control panel; modern storefronts model them as widgets',
    note: 'Treated as widgets where the storefront supports it, otherwise raised as a manual action.',
  },
  SCRIPTS: {
    key: 'SCRIPTS',
    label: 'Scripts',
    group: 'Content',
    description: 'Storefront scripts injected into the head or footer.',
    automation: 'AUTOMATED',
    channelVariable: true,
    requiresMapping: true,
    apiSurface: 'Scripts API v3 — /v3/content/scripts',
    note: 'Scripts created by one API account cannot be modified by another. Copying scripts across stores can duplicate analytics tags — review before deploying.',
  },
  REDIRECTS: {
    key: 'REDIRECTS',
    label: 'Redirects',
    group: 'Content',
    description: '301 redirects for storefront URLs.',
    automation: 'AUTOMATED',
    channelVariable: true,
    requiresMapping: false,
    apiSurface: 'Redirects API v3 — /v3/storefront/redirects',
    note: 'Redirects are scoped to a site, which in Multi-Storefront stores maps to a channel.',
  },
  THEMES: {
    key: 'THEMES',
    label: 'Themes',
    group: 'Design',
    description: 'Theme packages, versions and the active theme.',
    automation: 'PARTIAL',
    channelVariable: true,
    requiresMapping: false,
    apiSurface: 'Themes API v3 — /v3/themes, /v3/themes/actions/activate',
    note: 'Theme uploads are asynchronous and each store keeps a limited number of custom themes. Theme code is never merged automatically.',
  },
  THEME_CONFIGURATION: {
    key: 'THEME_CONFIGURATION',
    label: 'Theme configuration',
    group: 'Design',
    description: 'Theme settings and variations for a channel.',
    automation: 'PARTIAL',
    channelVariable: true,
    requiresMapping: false,
    apiSurface: 'Themes API v3 configuration endpoints',
    note: 'Settings keys differ between themes and theme versions, so configuration is only copied between compatible versions.',
  },
  STORE_SETTINGS: {
    key: 'STORE_SETTINGS',
    label: 'Store settings',
    group: 'Configuration',
    description: 'Store profile, contact details and general storefront settings.',
    automation: 'PARTIAL',
    channelVariable: true,
    requiresMapping: false,
    apiSurface: 'Settings API v3 — /v3/settings/store/profile and related resources',
    note: 'A meaningful subset of control-panel settings has no public API and is surfaced as a manual action.',
  },
  CHECKOUT_SETTINGS: {
    key: 'CHECKOUT_SETTINGS',
    label: 'Checkout settings',
    group: 'Configuration',
    description: 'Checkout behaviour, consent and order settings.',
    automation: 'PARTIAL',
    channelVariable: true,
    requiresMapping: false,
    apiSurface: 'Settings API v3 — checkout-related resources',
    note: 'Payment-gateway credentials are never read or written by this platform.',
  },
  SHIPPING_CONFIGURATION: {
    key: 'SHIPPING_CONFIGURATION',
    label: 'Shipping configuration',
    group: 'Configuration',
    description: 'Shipping zones, methods and rates.',
    automation: 'PARTIAL',
    channelVariable: false,
    requiresMapping: true,
    apiSurface: 'Shipping API v2/v3 — /v2/shipping/zones, /v3/shipping/zones/{id}/methods',
    note: 'Carrier connections require account credentials and are always a manual action.',
  },
  TAX_CONFIGURATION: {
    key: 'TAX_CONFIGURATION',
    label: 'Tax configuration',
    group: 'Configuration',
    description: 'Tax zones, rates, classes and settings.',
    automation: 'PARTIAL',
    channelVariable: false,
    requiresMapping: true,
    apiSurface: 'Tax API v3 — /v3/tax/settings, /v3/tax/zones, /v3/tax/rates',
    note: 'Third-party tax providers such as Avalara are configured outside this platform.',
  },
  CURRENCY_CONFIGURATION: {
    key: 'CURRENCY_CONFIGURATION',
    label: 'Currency configuration',
    group: 'Configuration',
    description: 'Enabled currencies, display formatting and exchange-rate mode.',
    automation: 'PARTIAL',
    channelVariable: true,
    requiresMapping: false,
    apiSurface: 'Currencies API v2 — /v2/currencies',
    note: 'The default (transactional) currency of a store cannot be changed through the API.',
  },
  LOCALE_CONFIGURATION: {
    key: 'LOCALE_CONFIGURATION',
    label: 'Locale configuration',
    group: 'Configuration',
    description: 'Channel locales and translation availability.',
    automation: 'PARTIAL',
    channelVariable: true,
    requiresMapping: false,
    apiSurface: 'Channels API v3 — /v3/channels/{id}/locales',
    note: 'Multi-language storefronts depend on the channel, the theme and the plan.',
  },
  SEO_DEFAULTS: {
    key: 'SEO_DEFAULTS',
    label: 'SEO defaults',
    group: 'Configuration',
    description: 'Default page titles, meta descriptions and URL structure.',
    automation: 'PARTIAL',
    channelVariable: true,
    requiresMapping: false,
    apiSurface: 'Settings API v3 and per-resource SEO fields',
    note: 'Per-resource SEO fields are automated; global URL structure options are a manual action.',
  },
  EMAIL_TEMPLATES: {
    key: 'EMAIL_TEMPLATES',
    label: 'Email templates',
    group: 'Configuration',
    description: 'Transactional email templates per channel.',
    automation: 'PARTIAL',
    channelVariable: true,
    requiresMapping: false,
    apiSurface: 'Email Templates API v3 — /v3/marketing/email-templates',
    note: 'Templates are per channel; template variables differ by BigCommerce email type.',
  },
};

export const RESOURCE_CATEGORY_LIST: ResourceCategoryMeta[] = RESOURCE_CATEGORIES.map(
  (key) => RESOURCE_CATEGORY_META[key],
);

export function resourceCategoryLabel(key: string): string {
  return RESOURCE_CATEGORY_META[key as ResourceCategory]?.label ?? key;
}

export function isResourceCategory(value: string): value is ResourceCategory {
  return (RESOURCE_CATEGORIES as readonly string[]).includes(value);
}
