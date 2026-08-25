# Database guide

## Local

SQLite at `prisma/dev.db`, created by `npm run db:setup`.

```bash
npm run db:studio    # browse
npm run db:migrate   # create a migration after a schema change
npm run db:deploy    # apply committed migrations
npm run db:reset     # drop, migrate, re-seed
npm run db:seed      # re-seed only
```

## Model groups

| Group | Models |
| --- | --- |
| Identity | `User`, `Session`, `Organisation`, `OrganisationMembership` |
| Hierarchy | `Company`, `Region`, `Brand`, `Environment`, `StoreGroup`, `StoreGroupMember` |
| Stores | `StoreConnection`, `StorefrontChannel`, `StoreRelationship` |
| Inheritance | `ConfigurationTemplate`, `InheritancePolicy`, `ResourceOverride` |
| Capability | `StoreCapability` |
| Credentials | `CredentialRecord` |
| Jobs | `SyncJob`, `SyncJobTarget`, `SyncJobItem` |
| Deployments | `Deployment`, `DeploymentTarget`, `DeploymentItem`, `ApprovalRequest` |
| Comparison | `Conflict`, `ConflictResolution`, `ProductMapping`, `CategoryMapping` |
| Snapshots | `ProductSnapshot`, `PricingEntry`, `PriceListSnapshot`, `InventoryRecord`, `OrderSnapshot`, `OrderLineSnapshot`, `OrderEvent`, `CustomerSnapshot`, `PromotionSnapshot`, `ContentSnapshot`, `AnalyticsSnapshot` |
| Customer groups | `CustomerGroupTemplate`, `CustomerGroupMapping` |
| Themes | `ThemeRelease`, `ThemeAssignment` |
| Provisioning | `ProvisioningPlan`, `ProvisioningStep`, `ManualActionItem` |
| Platform | `ConnectorDefinition`, `Notification`, `AuditEvent`, `FeatureFlag`, `SavedView` |

## Conventions

**Tenant ownership.** Every tenant-scoped model carries `organisationId`, and most also carry `companyId`.
Nothing is queried without it.

**Timestamps.** `createdAt` and `updatedAt` throughout.

**Soft deletion.** `deletedAt` on records worth keeping for history: organisations, companies, regions,
brands, store groups, connections, channels and templates. Snapshots and job records are hard-deleted by
cascade because they carry no independent meaning.

**Cascades, chosen deliberately.** Deleting an organisation cascades to everything it owns. Deleting a
connection cascades to its snapshots, capabilities, credentials and overrides. Optional references —
`regionId`, `brandId`, `environmentId`, `masterConnectionId`, `templateId` — use `SetNull` so removing a
grouping does not delete the store.

**Enumerated columns are `String`.** SQLite has no Prisma `enum`. Permitted values live in
`src/lib/enums.ts` as runtime tuples plus derived TypeScript unions, validated with Zod at every boundary.
Each column carries a Prisma doc comment naming the enum.

**JSON is text.** Structured payloads live in `*Json` columns and are read through typed helpers in
`src/lib/json.ts`, which fall back to a documented default rather than throwing inside a page render.

**Money is an exact decimal string** plus an ISO-4217 currency code — never a float. Arithmetic goes through
`src/lib/money.ts`, backed by bigint minor units.

**Nullable columns stay out of unique constraints.** SQLite treats NULLs as distinct, so a unique index over
a nullable column does not prevent duplicates. Scope discriminators use a sentinel string instead — for
example `channelScope = "store"`.

## Why snapshots rather than a mirror

The platform does not permanently mirror the BigCommerce catalogue. Snapshots exist to power comparison,
drift detection and dry-runs; they are upserted on each pull rather than accumulating history, and they are
never treated as the source of truth.

`ProductMapping` and `CustomerGroupMapping` are the important pieces. BigCommerce ids are store-local, so
cross-store operations resolve identity through an explicit mapping — by SKU for products, by name for
customer groups, by path for categories.

## Moving to PostgreSQL

1. Change the datasource in `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
2. Point `DATABASE_URL` at the instance.
3. Delete `prisma/migrations` and run `npx prisma migrate dev --name init` for a fresh baseline.
4. Optionally convert the string enum columns to native enums and the `*Json` columns to `jsonb`.
5. Convert money columns to `Decimal(19,4)`.
6. Run the unit tests — the domain logic is database-independent and should pass unchanged.

No business logic reads the database directly, so nothing outside the schema and the repository layer needs
to change.
