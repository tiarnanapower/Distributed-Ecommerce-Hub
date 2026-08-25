# Architecture overview

## Layering

The codebase separates concerns so that a change to one layer does not ripple through the others. The rule
that matters most: **UI never calls BigCommerce, and business logic never calls `fetch`.**

```
src/app/                 Pages and route handlers (Next.js App Router)
src/app/actions/         Server actions — validation, authz, audit, then delegate
src/components/          Presentational components; no data access
src/server/services/     Application services — orchestration and persistence
src/server/jobs/         Job runner and handlers
src/lib/                 Domain logic, pure where possible
  ├─ commerce/           Provider interface, BigCommerce client, demo provider, capability registry
  ├─ inheritance/        Effective-configuration resolver (pure)
  ├─ comparison/         Mapping and diff engines (pure)
  ├─ deployment/         Plan builder and blast radius (pure)
  ├─ crypto/             Encryption, hashing, redaction
  ├─ auth/               Auth adapter interface and the local implementation
  ├─ money.ts            Decimal-safe money (pure)
  └─ tenancy.ts          Tenant isolation (pure)
prisma/                  Schema, migrations, seed
```

Everything under `src/lib` that is marked *pure* has no database or network dependency, which is why the
domain rules are exhaustively unit-tested without fixtures or mocks.

## The provider seam

`CommerceProvider` (`src/lib/commerce/types.ts`) is the only interface application code knows about:

```ts
interface CommerceProvider {
  testConnection(): Promise<ConnectionResult>;
  getStoreInfo(): Promise<StoreInfo>;
  listChannels(): Promise<Channel[]>;
  listProducts(params: ProductQuery): Promise<Paginated<Product>>;
  getProduct(id: number): Promise<Product>;
  listOrders(params: OrderQuery): Promise<Paginated<Order>>;
  // …and the rest of the read surface
}
```

Two implementations exist:

- **`BigCommerceProvider`** — real REST calls through the typed client.
- **`DemoCommerceProvider`** — serves the seeded snapshots, makes no network call, and reports
  `isSimulated: true` on everything it returns.

`getProviderFor(connectionId)` picks between them and returns a `ProviderHandle` carrying the `source`
(`DEMO` or `LIVE`) and the reason for the choice. That handle travels to the UI, which is how every screen
can label where its numbers came from.

**Neither provider has write methods.** That is deliberate: a read-only code path cannot accidentally call
one, and enabling writes is a visible, reviewable change rather than a one-line slip.

## The BigCommerce client

`src/lib/commerce/bigcommerce/client.ts` is the single place that calls `fetch` against BigCommerce. It
handles base-URL construction for v2 and v3, the `X-Auth-Token` header, timeouts, bounded retries with
exponential backoff and jitter, structured errors, correlation ids and request logging with secrets redacted.

Rate limiting follows the documented behaviour: the client reads `X-Rate-Limit-Requests-Quota`,
`X-Rate-Limit-Requests-Left`, `X-Rate-Limit-Time-Window-Ms` and `X-Rate-Limit-Time-Reset-Ms`, waits for the
reported reset on a 429, and slows down proactively when the remaining quota gets thin.

Responses are validated with Zod at the boundary. If BigCommerce returns a shape the platform does not
recognise, the read fails loudly rather than producing `undefined` three layers up. Money arrives as a JSON
number and is converted to an exact decimal string immediately — it is never handled as a float again.

## The capability registry

`src/lib/commerce/capability-registry.ts` is the honest description of what the platform can do. Each of the
60 capabilities records its label, the exact OAuth scope required, the API surface, whether it writes, whether
it can vary per channel, its plan dependency, whether it needs confirmation, whether it is reversible, and the
reason it is unavailable when it is.

`resolveCapabilityStatus` combines the registry default with the scopes a token actually holds and what the
store reports about itself. A unit test asserts that no write is ever `AVAILABLE` by default, and that every
scope string is one of the documented BigCommerce scopes.

## Inheritance resolution

`src/lib/inheritance/resolver.ts` is pure. Given the layers that can contribute a value and the inheritance
mode in force, it returns the effective value *and its provenance*:

```
GLOBAL_DEFAULT → ORGANISATION_TEMPLATE → COMPANY_TEMPLATE → MASTER_STORE → REGIONAL → LOCAL_OVERRIDE
```

The most specific *permitted* layer wins — "permitted" being the subtlety, since the mode decides whether a
local override may beat an inherited value at all. Under `INHERIT_CONTINUOUS`, for example, an override is
retained but suppressed, and the UI says so rather than silently discarding it.

Policies themselves resolve most-specific-first across store → store group → region → company → organisation.

## Deployment planning

`src/lib/deployment/planner.ts` turns "copy these resources from here to there" into an inspectable plan:
per-target capability verdicts, per-item change types, validation errors and a blast radius. It writes
nothing. Execution consumes the plan.

A target is excluded — with the reason recorded — when its capability is not available, its inheritance mode
forbids writing, or the store is unhealthy. A deployment becomes destructive, and therefore requires a typed
confirmation, when it would replace a local override, when the strategy is `OVERWRITE`, or when it reaches
five or more live stores.

## Jobs

`src/server/jobs/runner.ts` is an in-process, database-persisted queue. Jobs are durable rows; work is
batched; failures retry with exponential backoff; handlers are idempotent on `(jobId, resourceKey)`; a job
left `RUNNING` by a restart is re-queued.

`JobQueue` is the only interface the application uses:

```ts
interface JobQueue {
  enqueue(input: EnqueueInput): Promise<{ jobId: string; correlationId: string }>;
  cancel(jobId: string): Promise<void>;
}
```

Moving to BullMQ, SQS, Cloud Tasks or Vercel Queues means implementing that interface and calling the
already-exported `executeJob(jobId)` from a worker. The handlers do not change.

What the local runner does **not** do: run while the Next.js process is stopped, or coordinate across
processes. See [Known limitations](known-limitations.md).

## Tenancy

Every tenant-scoped query is built from a `TenantScope` derived from the session. `tenantWhere(scope)` is the
choke point; `assertTenantAccess` guards single records and deliberately returns the same "could not be found"
message for a cross-tenant hit as for a genuine miss, so the API cannot be used as an existence oracle for
other organisations.

## Why we snapshot rather than sync

The platform stores *snapshots* of products, pricing, inventory, orders and customers rather than mirroring
the BigCommerce catalogue. Snapshots exist to power comparison, drift detection and dry-runs — they are
upserted on each pull rather than accumulating history, and they are never treated as the source of truth.

Customer data is the sharpest case: only a masked email and a salted hash are stored, and full personal data
is fetched on demand. That keeps the platform out of scope for most of what a customer record contains.

## Portability to PostgreSQL

SQLite is the local datastore, and three schema decisions exist purely to keep the move to PostgreSQL
mechanical:

- **Enumerated columns are `String`.** SQLite has no Prisma `enum`. The permitted values live in
  `src/lib/enums.ts` and are validated with Zod at every boundary.
- **Structured payloads are JSON *text*** in `*Json` columns, read through typed helpers.
- **Money is an exact decimal string** plus a currency code, never a float. Under PostgreSQL these become
  `Decimal(19,4)`.

Nullable columns are kept out of unique constraints, because SQLite treats NULLs as distinct; scope
discriminators use a sentinel string instead.

No business logic reads the database directly — it all goes through services and repositories, so swapping
the datasource does not touch domain code.
