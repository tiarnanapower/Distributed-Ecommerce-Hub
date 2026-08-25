# Capability matrix

> **Generated from `src/lib/commerce/capability-registry.ts`.** Do not edit by hand — run
> `npm run docs:capabilities` instead. It is generated so it can never drift from what the code does,
> which would defeat the point of having it.

Every manageable operation, what this platform can actually do with it today, and why when the answer is
"not much". A capability is only ever shown as **Available** when it is implemented, the required OAuth
scope is granted, and the store supports it.

## Status meanings

| Status | Count | Meaning |
| --- | --- | --- |
| **Available** | 19 | Implemented and usable, subject to the required scope being granted. |
| **Read-only** | 9 | Can be read but not modified by this platform. |
| **Permission missing** | 0 | The API account lacks the required OAuth scope. |
| **Plan-dependent** | 1 | Depends on a BigCommerce plan entitlement the store may not have. |
| **Manual action** | 6 | Deliberately not automated. Recorded as a checklist item with the reason. |
| **Not supported** | 3 | BigCommerce exposes no public API for this. It will never become available. |
| **Not yet implemented** | 24 | BigCommerce supports it; this release does not. See Known limitations. |

Total capabilities tracked: **62**.

## Minimum read scopes

Grant at least these for the verified read-only feature set:

- `store_v2_information_read_only`
- `store_v2_products_read_only`
- `store_v2_orders_read_only`
- `store_v2_customers_read_only`
- `store_v2_content_read_only`
- `store_channel_settings_read_only`
- `store_themes_read_only`

## Catalog

| Capability | Status | Required scope | API surface | Per-channel | Reversible |
| --- | --- | --- | --- | --- | --- |
| Read products | Available | `store_v2_products_read_only` | GET /v3/catalog/products | No | n/a |
| Update products | Not yet implemented | `store_v2_products` | PUT /v3/catalog/products/{product_id} | No | No |
| Create products | Not yet implemented | `store_v2_products` | POST /v3/catalog/products | No | No |
| Assign products to channels | Not yet implemented | `store_channel_listings` | PUT /v3/channels/{channel_id}/listings | Yes | Yes |
| Read categories | Available | `store_v2_products_read_only` | GET /v3/catalog/trees/categories | Yes | n/a |
| Manage categories | Not yet implemented | `store_v2_products` | POST/PUT /v3/catalog/trees/categories | Yes | No |
| Read brands | Available | `store_v2_products_read_only` | GET /v3/catalog/brands | No | n/a |
| Manage brands | Not yet implemented | `store_v2_products` | POST/PUT /v3/catalog/brands | No | No |

### Read products



**Note:** Implemented and verified. Product data is shared by every channel in the store.

### Update products



**Why it is not yet implemented:** BigCommerce supports this, but the write path is not enabled in this release. Catalog deployments run as dry-runs and produce a change plan instead.

**Note:** Enabling this requires per-store capability verification plus an approved deployment. See docs/production-readiness.md.

### Create products



**Why it is not yet implemented:** Not enabled in this release. Missing products are reported as conflicts and included in the dry-run plan.

**Note:** Product ids are assigned by the target store, so creation always produces a new mapping row.

### Assign products to channels



**Why it is not yet implemented:** Read of channel listings is implemented; the write path is not enabled in this release.

**Note:** Only meaningful inside a Multi-Storefront store. Independent stores have no shared listing surface.

**Plan dependency:** Requires Multi-Storefront on the store.

### Read categories



**Note:** Multi-Storefront stores can hold several category trees, each assigned to a channel.

### Manage categories



**Why it is not yet implemented:** Not enabled in this release. Category drift is reported and planned, not applied.

**Note:** Category ids differ per store, so every copy needs an explicit mapping.

### Read brands



**Note:** Brand ids are store-local.

### Manage brands



**Why it is not yet implemented:** Not enabled in this release.

**Note:** Brands are referenced by id from products, so ordering matters when copying a catalog.

## Pricing

| Capability | Status | Required scope | API surface | Per-channel | Reversible |
| --- | --- | --- | --- | --- | --- |
| Read price lists | Available | `store_v2_products_read_only` | GET /v3/pricelists, GET /v3/pricelists/{id}/records | Yes | n/a |
| Manage price lists | Not yet implemented | `store_v2_products` | POST/PUT /v3/pricelists, PUT /v3/pricelists/{id}/records | Yes | No |
| Update product pricing | Not yet implemented | `store_v2_products` | PUT /v3/catalog/products/{product_id} | No | No |

### Read price lists



**Note:** Price lists are how per-currency, per-channel and per-group pricing is expressed.

**Plan dependency:** Price-list capacity varies by plan.

### Manage price lists



**Why it is not yet implemented:** Not enabled in this release. Pricing deployments produce a plan only.

**Note:** Price records are keyed by variant id, which differs per store — mapping is mandatory.

**Plan dependency:** Price-list capacity varies by plan.

### Update product pricing



**Why it is not yet implemented:** Not enabled in this release.

**Note:** The product record holds a single base price in the store currency. Per-channel prices belong in price lists.

## Inventory

| Capability | Status | Required scope | API surface | Per-channel | Reversible |
| --- | --- | --- | --- | --- | --- |
| Read inventory | Available | `store_inventory_read_only` | GET /v3/inventory/items, GET /v3/inventory/locations/{id}/items | No | n/a |
| Update inventory | Not yet implemented | `store_inventory` | PUT /v3/inventory/adjustments/absolute, POST /v3/inventory/adjustments/relative | No | No |
| Read inventory locations | Available | `store_locations_read_only` | GET /v3/inventory/locations | No | n/a |

### Read inventory



**Note:** Falls back to product-level inventory_level when the Inventory API is unavailable.

**Plan dependency:** Multi-location inventory depends on plan.

### Update inventory



**Why it is not yet implemented:** Not enabled in this release. Inventory writes affect what customers can buy, so they stay behind explicit per-store verification.

**Note:** Independent stores never share physical stock. Treat every quantity as store-local unless an external system owns it.

**Plan dependency:** Multi-location inventory depends on plan.

### Read inventory locations



**Note:** Stores without multi-location inventory report a single default location.

**Plan dependency:** Multi-location inventory depends on plan.

## Orders

| Capability | Status | Required scope | API surface | Per-channel | Reversible |
| --- | --- | --- | --- | --- | --- |
| Read orders | Available | `store_v2_orders_read_only` | GET /v2/orders, GET /v2/orders/{id}/products | Yes | n/a |
| Update order status | Not yet implemented | `store_v2_orders` | PUT /v2/orders/{id} | No | No |
| Create refunds | Manual action | `store_v2_orders` | POST /v3/orders/{order_id}/payment_actions/refunds | No | No |
| Read order transactions | Read-only | `store_v2_transactions_read_only` | GET /v3/orders/{order_id}/transactions | No | n/a |
| Read fulfilment details | Read-only | `store_order_fulfillment_read_only` | GET /v2/orders/{id}/shipments | No | n/a |

### Read orders



**Note:** Personal data is masked at the provider boundary before it reaches storage or the UI.

### Update order status



**Why it is not yet implemented:** Not enabled in this release. Order status changes trigger customer emails and fulfilment side effects, so they open in the BigCommerce control panel instead.

**Note:** Status transitions are not freely reversible and can dispatch notifications.

### Create refunds



**Why it is manual action:** Refunds move real money and cannot be undone. This platform will not issue them; it links to the order in the BigCommerce control panel.

**Note:** Deliberately excluded from automation. Refund quotes and history are read-only here.

**Plan dependency:** Refund support depends on the payment gateway.

### Read order transactions



**Note:** Only gateway status and amount are surfaced. No card data is read, stored or displayed.

### Read fulfilment details



**Note:** Shipment records are read for the order timeline.

## Customers

| Capability | Status | Required scope | API surface | Per-channel | Reversible |
| --- | --- | --- | --- | --- | --- |
| Read customers | Available | `store_v2_customers_read_only` | GET /v3/customers | Yes | n/a |
| Manage customers | Not yet implemented | `store_v2_customers` | POST/PUT /v3/customers | No | No |
| Read customer groups | Available | `store_v2_customers_read_only` | GET /v2/customer_groups | No | n/a |
| Manage customer groups | Not yet implemented | `store_v2_customers` | POST/PUT /v2/customer_groups | No | No |

### Read customers



**Note:** Emails are masked and hashed at the boundary. Full personal data is fetched on demand and never persisted.

### Manage customers



**Why it is not yet implemented:** Not enabled. Copying customer records between stores would duplicate personal data across legal entities, which this platform will not do automatically.

**Note:** Customer identities are never merged across stores. See docs/security.md.

### Read customer groups



**Note:** Group ids are store-local and are always resolved through the mapping table.

### Manage customer groups



**Why it is not yet implemented:** Not enabled in this release. Group templates can be modelled, compared and dry-run against every store.

**Note:** Creating a group in a target store produces a new numeric id, recorded in CustomerGroupMapping.

## Content

| Capability | Status | Required scope | API surface | Per-channel | Reversible |
| --- | --- | --- | --- | --- | --- |
| Read pages | Available | `store_v2_content_read_only` | GET /v3/content/pages | Yes | n/a |
| Manage pages | Not yet implemented | `store_v2_content` | POST/PUT /v3/content/pages | Yes | No |
| Read widgets | Available | `store_v2_content_read_only` | GET /v3/content/widgets, GET /v3/content/placements | Yes | n/a |
| Manage widgets | Not yet implemented | `store_v2_content` | POST/PUT /v3/content/widgets, /v3/content/placements | Yes | No |
| Read redirects | Available | `store_v2_content_read_only` | GET /v3/storefront/redirects | Yes | n/a |
| Manage redirects | Not yet implemented | `store_v2_content` | PUT/POST /v3/storefront/redirects | Yes | Yes |
| Read scripts | Available | `store_v2_content_read_only` | GET /v3/content/scripts | Yes | n/a |
| Manage scripts | Not yet implemented | `store_v2_content` | POST/PUT /v3/content/scripts | Yes | Yes |
| Manage banners | Manual action | `store_v2_content` | No dedicated public banners API on current storefronts | No | Yes |
| Manage navigation | Not supported | — | None — navigation derives from the category tree and theme settings | Yes | Yes |

### Read pages



**Note:** Pages carry a channel id in Multi-Storefront stores.

### Manage pages



**Why it is not yet implemented:** Not enabled in this release. Content deployments produce a plan only.

**Note:** Page URLs must be unique per channel; collisions surface as conflicts during dry-run.

### Read widgets



**Note:** Placements bind a widget to a channel and a theme template file.

### Manage widgets



**Why it is not yet implemented:** Not enabled in this release.

**Note:** A widget cannot be placed unless the target theme exposes the same template region.

### Read redirects



**Note:** Redirects are scoped to a site, which corresponds to a channel.

### Manage redirects



**Why it is not yet implemented:** Not enabled in this release.

**Note:** Redirect paths are site-relative, so copying between stores requires domain-aware rewriting.

### Read scripts



**Note:** An API account can only see and modify the scripts it created.

### Manage scripts



**Why it is not yet implemented:** Not enabled in this release. Copying analytics or consent scripts between stores can double-count traffic or breach local consent rules.

**Note:** Scripts created by another API account are invisible to this one and can never be modified by it.

### Manage banners



**Why it is manual action:** Modern BigCommerce storefronts model promotional banners as widgets rather than a standalone banner resource.

**Note:** Raised as a manual action with the intended value recorded, so the change is still tracked and audited.

### Manage navigation



**Why it is not supported:** BigCommerce has no standalone navigation resource. Storefront navigation comes from the category tree, page visibility and theme configuration.

**Note:** Manage the underlying category tree and theme settings instead.

## Themes

| Capability | Status | Required scope | API surface | Per-channel | Reversible |
| --- | --- | --- | --- | --- | --- |
| Read themes | Available | `store_themes_read_only` | GET /v3/themes | Yes | n/a |
| Upload themes | Not yet implemented | `store_themes_manage` | POST /v3/themes (multipart) then poll the returned job | No | Yes |
| Activate themes | Not yet implemented | `store_themes_manage` | POST /v3/themes/actions/activate | Yes | Yes |
| Read theme configuration | Read-only | `store_themes_read_only` | GET /v3/themes/{uuid}/configurations | Yes | n/a |
| Manage theme configuration | Not yet implemented | `store_themes_manage` | Theme configuration endpoints | Yes | Yes |

### Read themes



**Note:** Reports installed themes, their versions and which variation is active.

### Upload themes



**Why it is not yet implemented:** Not enabled in this release. Theme releases are modelled, compared and deployed as simulated jobs.

**Note:** Uploads are asynchronous: the API returns a job that must be polled to completion.

**Plan dependency:** Each store keeps a limited number of custom themes.

### Activate themes



**Why it is not yet implemented:** Not enabled in this release. Activation changes the live storefront immediately for every visitor.

**Note:** Rollback is possible because the previous theme remains installed, provided the store has a free theme slot.

### Read theme configuration



**Note:** Configuration keys are theme-specific and differ between theme versions.

### Manage theme configuration



**Why it is not yet implemented:** Not enabled in this release.

**Note:** Copying configuration between incompatible theme versions silently drops unknown keys, so it is blocked unless versions match.

## Storefronts

| Capability | Status | Required scope | API surface | Per-channel | Reversible |
| --- | --- | --- | --- | --- | --- |
| Read channels | Available | `store_channel_settings_read_only` | GET /v3/channels, GET /v3/channels/{id}/site | No | n/a |
| Create storefront channels | Plan-dependent | `store_channel_settings` | POST /v3/channels | No | No |
| Manage channels | Not yet implemented | `store_channel_settings` | PUT /v3/channels/{channel_id} | Yes | Yes |
| Read sites and routes | Available | `store_sites_read_only` | GET /v3/sites, GET /v3/sites/{site_id}/routes | Yes | n/a |
| Manage sites and routes | Not yet implemented | `store_sites` | POST/PUT /v3/sites | Yes | No |
| Read storefront settings | Available | `store_v2_information_read_only` | GET /v2/store, GET /v3/settings/store/profile | Yes | n/a |
| Manage storefront settings | Not yet implemented | `store_v2_information` | PUT /v3/settings/store/profile and related resources | Yes | Yes |
| Read channel locales | Read-only | `store_channel_settings_read_only` | GET /v3/channels/{channel_id}/locales | Yes | n/a |
| Manage channel locales | Not yet implemented | `store_channel_settings` | PUT /v3/channels/{channel_id}/locales | Yes | Yes |

### Read channels



**Note:** Every store reports at least one channel, even without Multi-Storefront.

### Create storefront channels



**Why it is plan-dependent:** Only offered where the connected store reports Multi-Storefront support and spare storefront capacity. Execution is simulated in this release; the wizard produces a preflight report and a task list.

**Note:** A channel needs a matching site and routes before it serves traffic. Storefront seats are a commercial entitlement — confirm with your BigCommerce account team.

**Plan dependency:** Requires Multi-Storefront and an available storefront seat on the store plan. Creating a channel can have billing consequences.

### Manage channels



**Why it is not yet implemented:** Not enabled in this release.

**Note:** Deactivating a channel takes a storefront offline.

**Plan dependency:** Requires Multi-Storefront.

### Read sites and routes



**Note:** A site binds a channel to a URL.

### Manage sites and routes



**Why it is not yet implemented:** Not enabled in this release.

**Note:** Changing a site URL affects live traffic and SEO.

### Read storefront settings



**Note:** A meaningful subset of control-panel settings has no read API and shows as unavailable.

### Manage storefront settings



**Why it is not yet implemented:** Not enabled in this release. Unsupported settings are raised as manual actions.

**Note:** Not every control-panel setting is exposed by a public API — those become checklist items.

### Read channel locales



**Note:** Reported per channel, not per store.

**Plan dependency:** Multi-language storefronts depend on plan and theme support.

### Manage channel locales



**Why it is not yet implemented:** Not enabled in this release.

**Note:** Adding a locale without translated content degrades the storefront.

**Plan dependency:** Multi-language storefronts depend on plan and theme support.

## Marketing

| Capability | Status | Required scope | API surface | Per-channel | Reversible |
| --- | --- | --- | --- | --- | --- |
| Read promotions | Available | `store_v2_marketing_read_only` | GET /v3/promotions, GET /v3/promotions/coupons | Yes | n/a |
| Manage promotions | Not yet implemented | `store_v2_marketing` | POST/PUT /v3/promotions | Yes | Yes |

### Read promotions



**Note:** Promotion rule shapes vary; complex rules are summarised rather than fully modelled.

### Manage promotions



**Why it is not yet implemented:** Not enabled in this release. Only promotions whose rules can be round-tripped without loss would ever be copied.

**Note:** Promotion rules reference store-local product, category and customer-group ids.

## Configuration

| Capability | Status | Required scope | API surface | Per-channel | Reversible |
| --- | --- | --- | --- | --- | --- |
| Read shipping configuration | Read-only | `store_v2_information_read_only` | GET /v2/shipping/zones, GET /v2/shipping/zones/{id}/methods | No | n/a |
| Manage shipping configuration | Manual action | `store_v2_information` | POST/PUT /v2/shipping/zones | No | No |
| Read checkout settings | Read-only | `store_v2_information_read_only` | GET /v3/settings — checkout-related resources | Yes | n/a |
| Manage checkout settings | Manual action | `store_v2_information` | Partial coverage in Settings API v3 | Yes | Yes |
| Read tax configuration | Read-only | `store_v2_information_read_only` | GET /v3/tax/settings, /v3/tax/zones, /v3/tax/rates | No | n/a |
| Manage tax configuration | Manual action | `store_v2_information` | PUT /v3/tax/rates, /v3/tax/zones | No | No |
| Read currencies | Read-only | `store_v2_information_read_only` | GET /v2/currencies | No | n/a |
| Manage currencies | Manual action | `store_v2_information` | POST/PUT /v2/currencies | No | No |
| Manage domains | Not supported | — | None — domains and DNS are managed outside the store APIs | Yes | No |
| Read email templates | Read-only | `store_v2_content_read_only` | GET /v3/marketing/email-templates | Yes | n/a |
| Manage email templates | Not yet implemented | `store_v2_content` | PUT /v3/marketing/email-templates/{name} | Yes | Yes |

### Read shipping configuration



**Note:** Carrier connections require carrier account credentials and are never read by this platform.

### Manage shipping configuration



**Why it is manual action:** Shipping zones reference country and state codes that differ per market, and carrier connections cannot be automated at all. Copied configuration is raised as a reviewed manual action.

**Note:** Getting shipping wrong stops orders or loses money on every parcel, so it stays a human decision.

### Read checkout settings



**Note:** Payment-gateway configuration and credentials are out of scope entirely.

### Manage checkout settings



**Why it is manual action:** Checkout behaviour is only partially exposed by public APIs, and a wrong setting can stop conversion outright.

**Note:** This platform never touches payment-gateway credentials.

### Read tax configuration



**Note:** Where a third-party tax provider is active, BigCommerce is not the source of truth.

**Plan dependency:** Automatic tax may be provided by a third party such as Avalara.

### Manage tax configuration



**Why it is manual action:** Tax configuration carries legal and financial risk and varies per jurisdiction. It is never copied automatically between stores.

**Note:** Differences are reported so a tax owner can act on them deliberately.

### Read currencies



**Note:** Reports enabled currencies, display formatting and which is transactional.

**Plan dependency:** Multi-currency support depends on plan.

### Manage currencies



**Why it is manual action:** A store's default transactional currency cannot be changed after setup, and adding currencies affects pricing, tax and settlement.

**Note:** Adding a display currency is possible in the control panel; this platform records the intent as a manual action.

**Plan dependency:** Multi-currency support depends on plan.

### Manage domains



**Why it is not supported:** Domain registration, DNS records and SSL provisioning are not manageable through the store management APIs. They involve your registrar and the BigCommerce control panel.

**Note:** The launch checklist tracks these as manual steps with space for the DNS values.

### Read email templates



**Note:** Templates are per channel; available variables differ by email type.

### Manage email templates



**Why it is not yet implemented:** Not enabled in this release.

**Note:** Transactional email reaches customers directly, so changes are treated as high risk.

## Platform

| Capability | Status | Required scope | API surface | Per-channel | Reversible |
| --- | --- | --- | --- | --- | --- |
| Read store information | Available | `store_v2_information_read_only` | GET /v2/store | No | n/a |
| Provision a new BigCommerce store | Not supported | — | None — no public API creates a new BigCommerce store account | No | No |

### Read store information



**Note:** The connection test uses this endpoint. It is the cheapest way to prove a token works.

### Provision a new BigCommerce store



**Why it is not supported:** Creating an independent BigCommerce store is an account and billing operation, not a store-management API call. This platform provides guided provisioning: a checklist, a configuration template and a connection step once the store exists.

**Note:** Use the guided provisioning workflow under Stores → Add store.

**Plan dependency:** New stores are a commercial arrangement with BigCommerce.

## Every scope this platform can use

| Scope | Used by |
| --- | --- |
| `store_channel_listings` | Assign products to channels |
| `store_channel_listings_read_only` | Assign products to channels |
| `store_channel_settings` | Create storefront channels, Manage channel locales, Manage channels |
| `store_channel_settings_read_only` | Create storefront channels, Manage channel locales, Manage channels, Read channel locales, Read channels |
| `store_inventory` | Update inventory |
| `store_inventory_read_only` | Read inventory, Update inventory |
| `store_locations_read_only` | Read inventory locations |
| `store_order_fulfillment_read_only` | Read fulfilment details |
| `store_sites` | Manage sites and routes |
| `store_sites_read_only` | Manage sites and routes, Read sites and routes |
| `store_themes_manage` | Activate themes, Manage theme configuration, Upload themes |
| `store_themes_read_only` | Activate themes, Manage theme configuration, Read theme configuration, Read themes, Upload themes |
| `store_v2_content` | Manage banners, Manage email templates, Manage pages, Manage redirects, Manage scripts, Manage widgets |
| `store_v2_content_read_only` | Manage email templates, Manage pages, Manage redirects, Manage scripts, Manage widgets, Read email templates, Read pages, Read redirects, Read scripts, Read widgets |
| `store_v2_customers` | Manage customer groups, Manage customers |
| `store_v2_customers_read_only` | Manage customer groups, Manage customers, Read customer groups, Read customers |
| `store_v2_information` | Manage checkout settings, Manage currencies, Manage shipping configuration, Manage storefront settings, Manage tax configuration |
| `store_v2_information_read_only` | Manage checkout settings, Manage currencies, Manage shipping configuration, Manage storefront settings, Manage tax configuration, Read checkout settings, Read currencies, Read shipping configuration, Read store information, Read storefront settings, Read tax configuration |
| `store_v2_marketing` | Manage promotions |
| `store_v2_marketing_read_only` | Manage promotions, Read promotions |
| `store_v2_orders` | Create refunds, Update order status |
| `store_v2_orders_read_only` | Create refunds, Read orders, Update order status |
| `store_v2_products` | Create products, Manage brands, Manage categories, Manage price lists, Update product pricing, Update products |
| `store_v2_products_read_only` | Create products, Manage brands, Manage categories, Manage price lists, Read brands, Read categories, Read price lists, Read products, Update product pricing, Update products |
| `store_v2_transactions_read_only` | Read order transactions |

Scope names come from the BigCommerce
[API accounts documentation](https://docs.bigcommerce.com/docs/start/authentication/api-accounts).
A capability with no scope listed has no public API at all.

