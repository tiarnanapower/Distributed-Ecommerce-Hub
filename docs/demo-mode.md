# Demo mode

The application is fully usable with no BigCommerce credentials at all. That is not a fallback — it is the
default experience, and it is designed so that nothing about it can be mistaken for live data.

## No real data is used anywhere

Every organisation, company, store, product, order, customer and transaction in the seed is invented for this
project. There is no real merchant data, no real customer data and no scraped content.

Customer records use names assembled from a fixed list and email addresses on the reserved `.example` domain,
which by [RFC 2606](https://www.rfc-editor.org/rfc/rfc2606) can never route mail. Even so, they are stored
masked, exactly as a live customer's would be — the privacy path is the same one production would use.

## How demo and live data are kept apart

Three mechanisms, all visible in the UI:

1. **Per-connection flag.** A store is either a demo connection or a real one. Demo connections have no
   credential and can make no outbound call, because `DemoCommerceProvider` contains no networking code.
2. **Source labelling.** `getProviderFor()` returns the provider *and* the source (`DEMO` or `LIVE`) with the
   reason. Every screen renders a data-source badge from it.
3. **Mode switch.** `COMMERCE_MODE=demo` forces demo everywhere. `DISABLE_OUTBOUND_API=true` blocks outbound
   calls at the client, so an accidental live call is impossible rather than unlikely.

A page showing figures from both a demo and a live store renders **Mixed sources**, not a single blended
number presented as fact.

## What is simulated, and how it says so

| Behaviour | In demo mode |
| --- | --- |
| Connection test | Returns a generated result marked **Simulated**, including a deliberate failure for the seeded broken store |
| Capability probe | Resolves against the registry with `source: DEMO` |
| Catalog, orders, customers | Served from the seeded snapshots |
| Comparison scans | **Genuinely run** — the seeded conflicts are the real engine's output, not hand-written rows |
| Deployments | Plan and blast radius are real; execution records each item as *Simulated in demo mode* |
| Exchange rates | Fixed illustrative values, labelled *demo exchange rates* wherever they contribute |
| Analytics | Generated daily snapshots with a weekly rhythm and a gentle trend |

The comparison point matters: the seed calls `runComparisonScan()`, the same function the UI triggers. The
conflicts you see are what the engine actually produces, so exercising the resolution workflow exercises real
code.

## Deliberate imperfections in the seed

The estate is seeded with problems on purpose, because a demo where everything is green demonstrates nothing:

- **Acme Dealer Portal MEA** has an invalid token — a 401, a 26-day-old snapshot and a rotation task.
- **Acme Germany** is missing `store_themes_read_only`, so theme comparison shows *permission missing*.
- **Acme Japan** runs an older theme with five locally modified templates, blocking a rollout.
- **Acme Wholesale North America** has a customer group named `Trade  Silver` — two spaces — producing a
  genuine naming conflict.
- Several stores carry deliberate local price overrides; a few of those are stale, so the
  *source changed after override* path has real data.

## Moving to a real store

Adding a live connection does not remove the demo stores. They coexist, each labelled. See the
[BigCommerce connection guide](bigcommerce-connection.md).

## Re-seeding

```bash
npm run db:reset
```

The seed is deterministic, so the result is identical on every machine.
