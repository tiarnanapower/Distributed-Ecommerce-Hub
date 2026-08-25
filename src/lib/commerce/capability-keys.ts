/**
 * Capability keys.
 *
 * One key per manageable operation. Kept in its own module so both the
 * registry and the provider interface can reference them without a cycle.
 */
export const CAPABILITY_KEYS = [
  // Catalog
  'products.read',
  'products.update',
  'products.create',
  'products.channel_assign',
  'categories.read',
  'categories.manage',
  'brands.read',
  'brands.manage',
  // Pricing
  'price_lists.read',
  'price_lists.manage',
  'pricing.update',
  // Inventory
  'inventory.read',
  'inventory.update',
  'inventory_locations.read',
  // Orders
  'orders.read',
  'orders.update_status',
  'orders.create_refund',
  'orders.read_transactions',
  'orders.read_fulfilments',
  // Customers
  'customers.read',
  'customers.manage',
  'customer_groups.read',
  'customer_groups.manage',
  // Content
  'pages.read',
  'pages.manage',
  'widgets.read',
  'widgets.manage',
  'redirects.read',
  'redirects.manage',
  'scripts.read',
  'scripts.manage',
  'banners.manage',
  'navigation.manage',
  // Themes
  'themes.read',
  'themes.upload',
  'themes.activate',
  'theme_config.read',
  'theme_config.manage',
  // Storefront and channels
  'channels.read',
  'channels.create',
  'channels.manage',
  'sites.read',
  'sites.manage',
  'storefront_settings.read',
  'storefront_settings.manage',
  'locales.read',
  'locales.manage',
  // Marketing
  'promotions.read',
  'promotions.manage',
  // Commerce configuration
  'shipping.read',
  'shipping.manage',
  'checkout_settings.read',
  'checkout_settings.manage',
  'tax.read',
  'tax.manage',
  'currencies.read',
  'currencies.manage',
  'domains.manage',
  'email_templates.read',
  'email_templates.manage',
  // Platform
  'store_info.read',
  'store_provisioning.create',
] as const;

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

export function isCapabilityKey(value: string): value is CapabilityKey {
  return (CAPABILITY_KEYS as readonly string[]).includes(value);
}
