# Commerce Command Center

A centralised operations platform for enterprises running many BigCommerce stores and storefronts.

Connect independent stores, Multi-Storefront channels, regional and brand storefronts, and the development
stores behind them. Compare them, understand where they have drifted, and change them deliberately — with
every action recorded.

> **This is a development build.** Local authentication, SQLite and an in-process job runner are all
> intentional local-development choices and none is production-ready. See
> [Known limitations](docs/known-limitations.md) and the
> [Production-readiness checklist](docs/production-readiness.md).

---

## Getting started

Requires **Node 20.9+**. Nothing else — no Docker, no Redis, no external database, no API keys.

```bash
npm install
npm run db:setup
npm run dev
```

Then open <http://localhost:3000> and press **Sign in locally**.

`npm run db:setup` generates a `.env` with fresh secrets, applies the Prisma migrations and seeds a demo
organisation: one organisation, three companies, twelve stores across ten currencies, fifteen storefront
channels, and the products, orders, customers, conflicts, jobs and audit history that make the product
meaningful to look at.

If anything goes wrong, see [Troubleshooting](docs/local-setup.md#troubleshooting).

## What it does

| Area | What you get |
| --- | --- |
| **Estate** | Organisation → company → region → store group → store → storefront channel, with the differences between them made explicit |
| **Inheritance** | Six inheritance modes per resource category, resolved most-specific-first, with the origin of every effective value shown |
| **Capabilities** | A per-store matrix of what the platform can actually do, gated on implementation, OAuth scope and store plan |
| **Catalog** | A cross-store product matrix matched by SKU, distinguishing deliberate overrides from unexplained drift |
| **Conflicts** | Typed differences with resolution options, and an audit entry for every decision |
| **Deployments** | Dry-run first: change plan, capability verdicts, validation, blast radius, typed confirmation |
| **Sync Centre** | A persisted job queue with progress, retries, per-item results and correlation ids |
| **Orders & customers** | Unified views that keep customers store-scoped and never merge identities |
| **Themes & content** | Managed releases, per-store drift, and an explicit refusal to merge theme code |
| **Audit** | Every meaningful action, redacted, exportable |

## The rules this build follows

These are not aspirational; they are enforced in code and covered by tests.

1. **No invented endpoints.** Every API surface referenced comes from the BigCommerce developer
   documentation. Where no API exists, the feature is labelled *Not supported* with the reason.
2. **No operation is shown as available unless it is.** A write appears as available only when it is
   implemented, the required OAuth scope is granted, and the store supports it. See
   [the capability matrix](docs/capability-matrix.md).
3. **Demo and live data are never blended silently.** Every screen carries a data-source badge.
4. **Money is never a float, and currencies are never added.** Cross-currency totals require an explicit,
   dated exchange rate, and conversions built from demo rates say so.
5. **Ids are never assumed portable.** Products, categories and customer groups are matched by SKU, path and
   name — never by numeric id, which is store-local.
6. **Secrets never leave the server.** Credentials are encrypted at rest, redacted from every log, error and
   audit row, and are not retrievable through any route.
7. **Nothing destructive happens without a dry-run and an explicit confirmation.**

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm run db:setup` | Create `.env`, migrate and seed — safe to re-run |
| `npm run db:reset` | Drop, re-migrate and re-seed |
| `npm run db:studio` | Browse the database with Prisma Studio |
| `npm run typecheck` | TypeScript, strict mode |
| `npm run lint` | ESLint |
| `npm run test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright) |
| `npm run verify` | Typecheck, lint and unit tests together |
| `node scripts/smoke-routes.mjs` | Request every route with a real session and report the status |

## Connecting a real store

The application is fully usable without credentials. To connect a live store, see the
[BigCommerce connection guide](docs/bigcommerce-connection.md). In short: create a V2/V3 API account in the
store's control panel, grant the read scopes listed there, and paste the token into the connection wizard.

Verified read operations work against live stores. Write operations are deliberately not enabled in this
release — see [Known limitations](docs/known-limitations.md#write-operations).

## Documentation

- [Architecture overview](docs/architecture.md)
- [Local setup guide](docs/local-setup.md)
- [Environment variables](docs/environment-variables.md)
- [Database guide](docs/database.md)
- [BigCommerce connection guide](docs/bigcommerce-connection.md)
- [Security notes](docs/security.md)
- [Demo mode](docs/demo-mode.md)
- [Deploying to Vercel](docs/deployment-vercel.md)
- [Capability matrix](docs/capability-matrix.md)
- [Known limitations](docs/known-limitations.md)
- [Production-readiness checklist](docs/production-readiness.md)

## Stack

Next.js 15 (App Router) · TypeScript strict · React 19 · Tailwind CSS · shadcn/ui-style components on Radix ·
Recharts · Prisma · SQLite · Zod · React Hook Form · TanStack Table · Vitest · Playwright.

No AI dependency, model provider or assistant is included. See
[Known limitations](docs/known-limitations.md#ai-features).
