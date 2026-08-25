# BigCommerce connection guide

The application works fully without credentials. Follow this only when you want to read a real store.

## 1. Create an API account

In the store's BigCommerce control panel: **Settings → API accounts → Create API account →
V2/V3 API token**.

Give it a name that identifies this platform, so it is obvious later which integration a token belongs to.

## 2. Grant the scopes

Grant at least these **read** scopes. They are the exact machine-readable names from the BigCommerce
[API accounts documentation](https://docs.bigcommerce.com/docs/start/authentication/api-accounts):

| Scope | Enables |
| --- | --- |
| `store_v2_information_read_only` | Store profile, plan, Multi-Storefront status. **Required** — the connection test uses it |
| `store_v2_products_read_only` | Products, categories, brands, price lists |
| `store_v2_orders_read_only` | Orders |
| `store_v2_customers_read_only` | Customers and customer groups |
| `store_v2_content_read_only` | Pages, widgets, scripts, redirects |
| `store_channel_settings_read_only` | Channels and locales |
| `store_themes_read_only` | Themes and their configuration |

Useful additions:

| Scope | Enables |
| --- | --- |
| `store_sites_read_only` | Storefront URLs per channel |
| `store_inventory_read_only` | Inventory levels |
| `store_locations_read_only` | Inventory locations |
| `store_v2_marketing_read_only` | Promotions and coupons |
| `store_channel_listings_read_only` | Which products are listed on which channel |
| `store_v2_transactions_read_only` | Payment status on the order timeline |
| `store_order_fulfillment_read_only` | Shipment records |

A missing scope does not break the application. The affected capabilities show **Permission missing** with the
scope name, and everything else continues to work. The full list, with what each is used for, is on
Settings → Developer.

**Do not grant write scopes.** Write operations are not enabled in this release, so a write scope would grant
access the platform will not use. See [Known limitations](known-limitations.md#write-operations).

## 3. Find the store hash

It is in the control-panel URL:

```
https://store-{STORE_HASH}.mybigcommerce.com/manage/...
                ^^^^^^^^^^
```

Five to twenty letters and digits.

## 4. Connect

**Stores → Add store**, then work through the wizard:

1. **Connection type** — independent store, Multi-Storefront parent, storefront channel, development or
   sandbox. This choice affects how the store is treated throughout.
2. **Identity** — name, country, currency, locale, store type.
3. **Credentials** — store hash and access token. The token is encrypted with AES-256-GCM before it is
   stored and is never returned to a browser again.
4. **Placement** — company, region, brand, environment. These are groupings inside this platform only.
5. **Inheritance** — independent, inherited from a master, or template-based. Tunable per resource category
   afterwards.
6. **Verify** — run the connection test.

The test calls `GET /v2/store`, the cheapest proof that a token works. On success the capability matrix is
built from the scopes the credential actually holds.

## 5. Pull the data

Connecting a store records it; it does not fetch anything. To populate the catalog, orders and customers,
run a sync:

**Sync Centre → Run a sync**, or from a store page, **Sync store**.

| Job | What it captures | Scope it needs |
| --- | --- | --- |
| Connection refresh | Store profile, plan, currency, domain, Multi-Storefront status | `store_v2_information_read_only` |
| Channel discovery | Channels and their site URLs | `store_channel_settings_read_only` |
| Catalog pull | A product snapshot per product | `store_v2_products_read_only` |
| Order pull | Orders and their line items, over a chosen window | `store_v2_orders_read_only` |
| Customer pull | Customers (masked) and customer groups | `store_v2_customers_read_only` |
| Analytics refresh | Recomputes cached metrics from existing snapshots | none — no API call |

Run **Connection refresh** first: it is the cheapest, and it records the plan and Multi-Storefront status that
other features gate on. Then catalog, then orders and customers.

These are all reads. Nothing is written back to the store, which is why there is no dry-run or confirmation
step — unlike a deployment, a sync cannot change what a customer sees.

Progress appears in the Sync Centre with per-item results and a correlation id. A failure names the store and
the reason rather than failing the whole run.

### About scopes

BigCommerce does not expose an endpoint that reports which scopes an API account token holds. The connection
test therefore proves the token *works* but cannot enumerate its permissions, and says so. Capabilities are
reported from the registry until a read actually returns 403, at which point the affected capability is
downgraded with the scope named.

## 6. Discover channels

For a Multi-Storefront store, run **Discover channels** from the store's Storefronts tab. It reads
`GET /v3/channels` and `GET /v3/sites` and records each channel with its site URL.

Every store reports at least one channel, even without Multi-Storefront.

## What happens next

The store appears in the directory alongside the demo stores, labelled **Live data** rather than **Demo mode**.
Reads go to BigCommerce; comparison, conflict detection and dry-runs all work against it.

## Rotating a credential

When a token is regenerated in BigCommerce, add the new one on the store's Credentials tab. The previous
record is marked rotated rather than deleted, preserving the audit trail, and the connection is re-tested
immediately.

## Disconnecting

**Store → Credentials → Disconnect** revokes the stored credentials and marks the store disconnected.
Snapshots and history are retained. It requires typing the store name exactly.

## Troubleshooting

**401 Unauthorized.** The token has been revoked or regenerated. Rotate it.

**403 Forbidden.** The token is valid but lacks a scope — a different fix from a 401. The error names the
scope; add it in the control panel and re-run the capability check.

**404 on a resource you can see in the control panel.** Resource ids are store-local. Check the mapping
between the source and target store.

**429 Too Many Requests.** The client backs off using `X-Rate-Limit-Time-Reset-Ms` and retries automatically.
Persistent 429s mean reducing job concurrency.

**Timeouts.** Raise `BIGCOMMERCE_REQUEST_TIMEOUT_MS` or reduce the page size for that endpoint.

**"BigCommerce returned a response this platform did not recognise."** The API shape has changed. The read is
skipped rather than guessed at. The server log names the failing field.

## What is never done

- No payment-gateway credential is ever read, written or copied.
- No card data is read, stored or displayed.
- No secret is copied from one store to another.
- No write call is made while a preview or dry-run is displayed.
- No destructive call is made in demo mode.
