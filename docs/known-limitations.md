# Known limitations

An honest account of what this build does not do. Nothing here is hidden in the product: each limitation is
surfaced in the UI at the point where someone would otherwise assume otherwise.

## Local authentication is not production-ready

There is no identity provider, no password, no MFA, no account lockout and no public registration. Pressing
**Sign in locally** selects the seeded administrator and mints a session.

What it *does* do properly, so the replacement is a drop-in: the cookie carries only a random token, the
database stores only its hash, sessions expire and can be revoked, and authorization always re-reads the
database.

Replacing it means implementing `AuthAdapter` (`src/lib/auth/types.ts`) and returning the new implementation
from `getAuthAdapter()`. No other application code changes. Auth.js, Microsoft Entra ID, Okta, Google
Workspace, SAML and OpenID Connect all fit that interface.

**Surfaced in the UI:** a persistent banner in the app shell, a warning panel on the login page, and the
adapter's `isProductionReady: false` flag on Settings → Developer.

## SQLite is for local development

Single-writer, file-based, no network access, no replication, no point-in-time recovery. Concurrent writes
serialise. It is the right choice for `npm install && npm run dev` and the wrong one for anything shared.

The schema is written to make the move mechanical — see
[Architecture § Portability](architecture.md#portability-to-postgresql). Enumerated columns are strings, JSON
payloads are text, money is an exact decimal string, and no business logic touches the database directly.

**Surfaced in the UI:** the same banner, plus Settings → Credential encryption.

## Background work uses a local job runner

The queue is in-process and persisted to the database. It batches, retries with exponential backoff, is
idempotent per item, and re-queues jobs interrupted by a restart.

It does **not** run while the Next.js process is stopped, and it does not coordinate across processes — two
instances would both poll the same table. Scheduled comparison scans are therefore behind a disabled feature
flag.

`JobQueue` is the seam; `executeJob(jobId)` is already exported for a worker to call.

**Surfaced in the UI:** an explanatory note on the Sync Centre.

## Write operations

**Verified read operations work against live BigCommerce stores. Writes are not enabled in this release.**

This is a deliberate choice, not an oversight. A cross-store write that goes wrong is expensive and hard to
reverse, and the honest position is that each write path needs per-store capability verification, an approval
policy and rollback coverage before it should touch a live storefront.

What works today: comparison, mapping, drift detection, dry-runs, blast-radius calculation, validation,
approval routing and the full audit trail. A deployment against a live store records each item as **blocked**
with the reason rather than reporting a success that did not happen. Against a demo store it records
**simulated**.

**Surfaced in the UI:** every affected capability shows *Not yet implemented* with the reason, in the
capability matrix, the deployment plan and the relevant workspace.

## Independent-store provisioning is manual

No public BigCommerce API creates a new store account — it is an account and billing operation. The platform
offers guided provisioning instead: capture the intended configuration, generate a checklist separating
automated from manual steps, and connect the store once it exists.

Steps with no API at all: creating the store, creating an API account and its token, setting the default
transactional currency, configuring a payment gateway, and registering a domain with DNS and SSL.

**Surfaced in the UI:** Stores → Add store → Guided provisioning states this plainly, with a
"what this platform cannot do" panel.

## Not every control-panel setting has an API

A meaningful subset of BigCommerce configuration has no supported public API. Where the platform detects one,
it raises a **manual action** recording the current value, the desired value, the reason and a documentation
link, then tracks it as a checklist item with an audit entry on completion.

Known cases: navigation structure (derived from the category tree and theme, not a resource), banners on
modern storefronts (modelled as widgets), domains and DNS, payment-gateway configuration, the default
transactional currency, and parts of checkout and SEO configuration.

**Surfaced in the UI:** Settings → Manual actions, and the store's Configuration tab.

## BigCommerce features depend on plan, configuration and permissions

Multi-Storefront, storefront seat count, multi-location inventory, price-list capacity and multi-currency all
vary by plan. The platform never assumes: it reads what the store reports, and gates the affected capability
as *plan-dependent* with the reason when the entitlement is absent.

Similarly, a missing OAuth scope downgrades a capability to *permission missing* or *read-only* rather than
hiding the feature or failing at the moment of use.

## Integration connectors are display-only

The 25 connectors in the integrations directory perform no authentication, store no credential and make no
outbound request. Each card explains what the integration would mean for a multi-store estate — particularly
where it would become the source of truth and this platform should step back to read-only.

**Surfaced in the UI:** a prominent note at the top of the directory, plus a per-card status badge.

## AI features

**No AI dependency, model provider, API key or assistant is included.** This is intentional and complete —
nothing is stubbed pending a key.

An **Automation Assistant** navigation item exists behind a feature flag, disabled by default. Enabling it
reveals a page stating: *AI-assisted operations are not configured in this environment.*

The reasoning: a convincing-looking assistant that cannot actually inspect an estate or execute a change
invites trust it has not earned, in a product whose entire purpose is telling you exactly what it can and
cannot do to your live stores.

## What a sync does and does not capture

The Sync Centre pulls store metadata, channels, products, orders, customers and customer groups. It does not
yet pull: inventory locations and levels, price lists and their records, content (pages, widgets, scripts,
redirects), themes, or promotions. The provider implements the reads for all of those — there is simply no job
handler wired to them yet, so those workspaces show seeded demo data for demo stores and nothing for a live
one.

Scope introspection is impossible: BigCommerce has no endpoint that reports which scopes a token holds. The
connection test proves the token works and says plainly that it cannot enumerate permissions. A capability is
reported from the registry until a real 403 downgrades it.

## Analytics gaps

Two metrics cannot be measured from the BigCommerce management API and are shown as **unavailable with the
reason** rather than estimated:

- **Conversion rate** needs storefront session data, which requires an analytics integration.
- **Per-channel revenue** needs reliable channel attribution on orders. The platform attributes revenue only
  for stores with exactly one storefront; splitting a multi-storefront store's revenue would be a guess.

Multi-currency totals are held per currency and only combined when an explicit exchange rate exists. The rates
in this build are fixed demo values and are labelled as such wherever they contribute.

## Other gaps

- **Editing forms.** Organisation, company, region, brand and template records are readable and seeded but
  not editable through the UI. The data model, tenancy and audit trail all support it.
- **Inbound rate limiting.** Outbound rate limiting against BigCommerce is implemented; this application's own
  routes are not limited.
- **Content Security Policy.** Not configured. See [Security](security.md#http-headers).
- **CSV import.** Export is implemented on every table; import is not.
- **Saved views** are seeded and readable but cannot yet be created from the UI.
- **Theme diffing** shows version and local-modification status, not a file-level diff.
- **One organisation.** The data model is multi-organisation throughout; the UI assumes one.
- **Accessibility** follows sensible practice — semantic HTML, focus management, keyboard operation, labelled
  controls, contrast-checked colours — but has not been audited against WCAG by a specialist or tested with a
  screen reader.
