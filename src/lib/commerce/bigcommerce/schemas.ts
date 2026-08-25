/**
 * Runtime validation for the BigCommerce responses this platform depends on.
 *
 * Every schema is deliberately permissive about fields we do not use
 * (`.passthrough()` is avoided in favour of simply not declaring them) and
 * strict about the fields we do, so a shape change surfaces as a clear error
 * rather than an `undefined` deep inside a page.
 *
 * Money arrives from BigCommerce as a JSON number. It is converted to an exact
 * decimal string at this boundary and never handled as a float again.
 */
import { z } from 'zod';

/** BigCommerce sends prices as numbers; normalise to exact strings immediately. */
const decimalString = z
  .union([z.number(), z.string(), z.null()])
  .transform((value) => {
    if (value === null) return null;
    if (typeof value === 'string') return value.trim() === '' ? null : value.trim();
    return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') || '0';
  });

const requiredDecimalString = decimalString.transform((value) => value ?? '0');

const dateish = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  });

// --- Store information (v2) -------------------------------------------------

export const storeInfoSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  domain: z.string().nullable().optional(),
  secure_url: z.string().nullable().optional(),
  control_panel_base_url: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  name: z.string(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  country_code: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  admin_email: z.string().nullable().optional(),
  order_email: z.string().nullable().optional(),
  timezone: z
    .object({
      name: z.string().nullable().optional(),
      raw_offset: z.number().nullable().optional(),
    })
    .nullable()
    .optional(),
  language: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  currency_symbol: z.string().nullable().optional(),
  weight_units: z.string().nullable().optional(),
  plan_name: z.string().nullable().optional(),
  plan_level: z.string().nullable().optional(),
  plan_is_trial: z.boolean().nullable().optional(),
  industry: z.string().nullable().optional(),
  features: z
    .object({
      stencil_enabled: z.boolean().nullable().optional(),
      sitewidehttps_enabled: z.boolean().nullable().optional(),
      facebook_catalog_id: z.string().nullable().optional(),
      checkout_type: z.string().nullable().optional(),
      wishlists_enabled: z.boolean().nullable().optional(),
      graphql_storefront_api_enabled: z.boolean().nullable().optional(),
      multi_storefront_enabled: z.boolean().nullable().optional(),
      storefront_limits: z
        .object({
          active: z.number().nullable().optional(),
          total_including_inactive: z.number().nullable().optional(),
        })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
});

export type RawStoreInfo = z.infer<typeof storeInfoSchema>;

// --- Channels (v3) ----------------------------------------------------------

export const channelSchema = z.object({
  id: z.number(),
  name: z.string(),
  platform: z.string(),
  type: z.string(),
  status: z.string().optional().default('active'),
  is_listable_from_ui: z.boolean().optional().default(true),
  is_visible: z.boolean().optional().default(true),
  external_id: z.string().nullable().optional(),
  date_created: dateish,
  date_modified: dateish,
  config_meta: z.unknown().optional(),
  currencies: z.unknown().optional(),
});

export const channelListSchema = z.array(channelSchema);

export const channelSiteSchema = z.object({
  id: z.number(),
  channel_id: z.number(),
  url: z.string().nullable().optional(),
  created_at: dateish,
  updated_at: dateish,
});

export const siteSchema = z.object({
  id: z.number(),
  channel_id: z.number().nullable().optional(),
  url: z.string().nullable().optional(),
});

export const siteListSchema = z.array(siteSchema);

export const channelCurrencySchema = z.object({
  channel_id: z.number().optional(),
  default_currency: z.string().nullable().optional(),
  enabled_currencies: z.array(z.string()).optional().default([]),
});

export const channelLocaleSchema = z.object({
  channel_id: z.number().optional(),
  code: z.string(),
  status: z.string().optional(),
  is_default: z.boolean().optional().default(false),
});

// --- Catalog (v3) -----------------------------------------------------------

export const productImageSchema = z.object({
  id: z.number(),
  url_standard: z.string().optional(),
  url_thumbnail: z.string().optional(),
  url_zoom: z.string().optional(),
  is_thumbnail: z.boolean().optional().default(false),
  description: z.string().nullable().optional(),
});

export const productVariantSchema = z.object({
  id: z.number(),
  sku: z.string().nullable().optional(),
  price: decimalString.nullable().optional(),
  cost_price: decimalString.nullable().optional(),
  inventory_level: z.number().nullable().optional(),
  option_values: z
    .array(z.object({ label: z.string().optional(), option_display_name: z.string().optional() }))
    .optional()
    .default([]),
});

export const customFieldSchema = z.object({
  id: z.number().nullable().optional(),
  name: z.string(),
  value: z.string(),
});

export const productSchema = z.object({
  id: z.number(),
  name: z.string(),
  sku: z.string().optional().default(''),
  type: z.string().optional().default('physical'),
  price: requiredDecimalString,
  sale_price: decimalString.nullable().optional(),
  retail_price: decimalString.nullable().optional(),
  cost_price: decimalString.nullable().optional(),
  weight: decimalString.nullable().optional(),
  is_visible: z.boolean().optional().default(true),
  availability: z.string().optional().default('available'),
  inventory_level: z.number().nullable().optional(),
  inventory_tracking: z.string().optional().default('none'),
  brand_id: z.number().nullable().optional(),
  categories: z.array(z.number()).optional().default([]),
  page_title: z.string().nullable().optional(),
  meta_description: z.string().nullable().optional(),
  date_created: dateish,
  date_modified: dateish,
  images: z.array(productImageSchema).optional(),
  variants: z.array(productVariantSchema).optional(),
  custom_fields: z.array(customFieldSchema).optional(),
});

export const productListSchema = z.array(productSchema);

export const categorySchema = z.object({
  category_id: z.number().optional(),
  id: z.number().optional(),
  parent_id: z.number().optional().default(0),
  tree_id: z.number().optional(),
  name: z.string(),
  is_visible: z.boolean().optional().default(true),
  sort_order: z.number().optional().default(0),
  url: z.object({ path: z.string().optional() }).nullable().optional(),
});

export const categoryListSchema = z.array(categorySchema);

export const brandSchema = z.object({
  id: z.number(),
  name: z.string(),
  page_title: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
});

export const brandListSchema = z.array(brandSchema);

// --- Price lists (v3) -------------------------------------------------------

export const priceListSchema = z.object({
  id: z.number(),
  name: z.string(),
  active: z.boolean().optional().default(true),
  date_created: dateish,
  date_modified: dateish,
});

export const priceListsSchema = z.array(priceListSchema);

export const priceRecordSchema = z.object({
  price_list_id: z.number(),
  variant_id: z.number(),
  sku: z.string().nullable().optional(),
  currency: z.string(),
  price: requiredDecimalString,
  sale_price: decimalString.nullable().optional(),
  retail_price: decimalString.nullable().optional(),
  map_price: decimalString.nullable().optional(),
});

export const priceRecordsSchema = z.array(priceRecordSchema);

// --- Inventory (v3) ---------------------------------------------------------

export const inventoryLocationSchema = z.object({
  id: z.number(),
  code: z.string(),
  label: z.string(),
  enabled: z.boolean().optional().default(true),
  type_id: z.string().nullable().optional(),
  address: z.object({ country_code: z.string().nullable().optional() }).nullable().optional(),
});

export const inventoryLocationsSchema = z.array(inventoryLocationSchema);

export const inventoryItemSchema = z.object({
  location_id: z.number().nullable().optional(),
  product_id: z.number(),
  variant_id: z.number().nullable().optional(),
  identity: z
    .object({
      sku: z.string().nullable().optional(),
      product_id: z.number().optional(),
      variant_id: z.number().nullable().optional(),
    })
    .optional(),
  sku: z.string().nullable().optional(),
  available_to_sell: z.number().nullable().optional(),
  total_inventory_onhand: z.number().nullable().optional(),
  settings: z
    .object({
      safety_stock: z.number().nullable().optional(),
      is_in_stock: z.boolean().nullable().optional(),
    })
    .nullable()
    .optional(),
});

export const inventoryItemsSchema = z.array(inventoryItemSchema);

// --- Orders (v2) ------------------------------------------------------------

export const orderSchema = z.object({
  id: z.number(),
  customer_id: z.number().nullable().optional(),
  date_created: z.string(),
  date_modified: z.string().nullable().optional(),
  status_id: z.number().nullable().optional(),
  status: z.string().optional().default('Unknown'),
  subtotal_ex_tax: requiredDecimalString,
  subtotal_inc_tax: requiredDecimalString,
  total_ex_tax: requiredDecimalString,
  total_inc_tax: requiredDecimalString,
  shipping_cost_inc_tax: requiredDecimalString,
  total_tax: requiredDecimalString,
  discount_amount: requiredDecimalString,
  coupon_discount: decimalString.nullable().optional(),
  refunded_amount: requiredDecimalString,
  currency_code: z.string().optional().default('USD'),
  items_total: z.number().optional().default(0),
  payment_method: z.string().nullable().optional(),
  payment_status: z.string().nullable().optional(),
  staff_notes: z.string().nullable().optional(),
  channel_id: z.number().nullable().optional(),
  order_source: z.string().nullable().optional(),
  billing_address: z
    .object({
      first_name: z.string().nullable().optional(),
      last_name: z.string().nullable().optional(),
      company: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
      city: z.string().nullable().optional(),
      state: z.string().nullable().optional(),
      zip: z.string().nullable().optional(),
      country_iso2: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

export const orderListSchema = z.array(orderSchema);

export const orderProductSchema = z.object({
  id: z.number(),
  product_id: z.number().nullable().optional(),
  name: z.string(),
  sku: z.string().nullable().optional(),
  quantity: z.number(),
  base_price: requiredDecimalString,
  price_inc_tax: requiredDecimalString,
  total_inc_tax: requiredDecimalString,
  product_options: z
    .array(z.object({ display_name: z.string().optional(), display_value: z.string().optional() }))
    .optional()
    .default([]),
});

export const orderProductsSchema = z.array(orderProductSchema);

export const orderShippingAddressSchema = z.object({
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  zip: z.string().nullable().optional(),
  country_iso2: z.string().nullable().optional(),
});

export const orderShippingAddressesSchema = z.array(orderShippingAddressSchema);

// --- Customers (v3) ---------------------------------------------------------

export const customerSchema = z.object({
  id: z.number(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  customer_group_id: z.number().nullable().optional(),
  store_credit_amounts: z.array(z.object({ amount: z.number() })).optional().default([]),
  accepts_product_review_abandoned_cart_emails: z.boolean().optional().default(false),
  channel_ids: z.array(z.number()).nullable().optional(),
  date_created: dateish,
  date_modified: dateish,
});

export const customerListSchema = z.array(customerSchema);

// --- Customer groups (v2) ---------------------------------------------------

export const customerGroupSchema = z.object({
  id: z.number(),
  name: z.string(),
  is_default: z.boolean().optional().default(false),
  category_access: z
    .object({ type: z.string().optional(), categories: z.array(z.number()).optional() })
    .nullable()
    .optional(),
  discount_rules: z
    .array(
      z.object({
        type: z.string().optional(),
        method: z.string().optional(),
        amount: z.union([z.string(), z.number()]).optional(),
      }),
    )
    .optional()
    .default([]),
});

export const customerGroupListSchema = z.array(customerGroupSchema);

// --- Content (v3) -----------------------------------------------------------

export const pageSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.string().optional().default('page'),
  url: z.string().nullable().optional(),
  is_visible: z.boolean().optional().default(true),
  channel_id: z.number().nullable().optional(),
  meta_title: z.string().nullable().optional(),
  meta_description: z.string().nullable().optional(),
});

export const pageListSchema = z.array(pageSchema);

export const widgetSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  widget_template_uuid: z.string().optional().default(''),
  channel_id: z.number().nullable().optional(),
  date_modified: dateish,
});

export const widgetListSchema = z.array(widgetSchema);

export const redirectSchema = z.object({
  id: z.number(),
  site_id: z.number().nullable().optional(),
  from_path: z.string(),
  to: z.object({ type: z.string().optional(), url: z.string().nullable().optional() }).nullable().optional(),
  to_url: z.string().nullable().optional(),
});

export const redirectListSchema = z.array(redirectSchema);

export const scriptSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  location: z.string().optional().default('head'),
  visibility: z.string().optional().default('storefront'),
  kind: z.string().optional().default('src'),
  channel_id: z.number().nullable().optional(),
});

export const scriptListSchema = z.array(scriptSchema);

// --- Themes (v3) ------------------------------------------------------------

export const themeSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  is_private: z.boolean().optional().default(false),
  variations: z
    .array(
      z.object({
        uuid: z.string(),
        name: z.string(),
        is_current: z.boolean().optional().default(false),
      }),
    )
    .optional()
    .default([]),
});

export const themeListSchema = z.array(themeSchema);

// --- Promotions (v3) --------------------------------------------------------

export const promotionSchema = z.object({
  id: z.number(),
  name: z.string(),
  status: z.string().optional().default('DISABLED'),
  redemption_type: z.string().optional().default('AUTOMATIC'),
  start_date: dateish,
  end_date: dateish,
  current_uses: z.number().nullable().optional(),
  max_uses: z.number().nullable().optional(),
  channels: z.array(z.object({ id: z.number() })).nullable().optional(),
  notifications: z.unknown().optional(),
  rules: z.unknown().optional(),
});

export const promotionListSchema = z.array(promotionSchema);
