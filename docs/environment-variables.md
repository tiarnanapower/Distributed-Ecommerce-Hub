# Environment variables

Copy `.env.example` to `.env`, or let `npm run db:setup` do it and generate the secrets for you.

No variable is ever read outside `src/lib/config.ts`, which parses and validates the whole environment with
Zod at startup. A malformed value fails fast, naming the offending key but never printing its value.

## Database

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `file:./dev.db` | SQLite path, or a PostgreSQL URL after changing the Prisma datasource. |

## Application

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test` or `production`. |
| `APP_BASE_URL` | `http://localhost:3000` | Used for absolute links. |

## Security

| Variable | Default | Notes |
| --- | --- | --- |
| `ENCRYPTION_KEY` | *(generated)* | 32 bytes, base64. Encrypts stored credentials with AES-256-GCM. **Use a managed KMS in production.** |
| `SESSION_SECRET` | *(generated)* | 48 bytes, base64. Keys the HMAC used to hash IPs and customer emails. |
| `SESSION_TTL_HOURS` | `12` | Session lifetime. |

Generate either:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Changing `ENCRYPTION_KEY` makes every existing credential unreadable. Changing `SESSION_SECRET` invalidates
every session and changes every derived hash.

## Operating mode

| Variable | Default | Notes |
| --- | --- | --- |
| `COMMERCE_MODE` | `hybrid` | `demo` — seeded data only, no outbound calls ever. `connected` — live reads for stores with credentials. `hybrid` — per connection. |
| `DISABLE_OUTBOUND_API` | `false` | Hard kill-switch. When `true`, the BigCommerce provider refuses every request including reads. |

`DISABLE_OUTBOUND_API=true` is the setting to use when demonstrating on an untrusted network: it makes an
accidental live call impossible rather than merely unlikely.

## BigCommerce API

| Variable | Default | Notes |
| --- | --- | --- |
| `BIGCOMMERCE_API_HOST` | `https://api.bigcommerce.com` | |
| `BIGCOMMERCE_LOGIN_HOST` | `https://login.bigcommerce.com` | |
| `BIGCOMMERCE_REQUEST_TIMEOUT_MS` | `20000` | Per-request timeout. |
| `BIGCOMMERCE_MAX_RETRIES` | `3` | Retries on 429, 5xx and network errors. |
| `BIGCOMMERCE_STORE_HASH` | *(empty)* | Optional. Not used by the app; connections hold their own. |
| `BIGCOMMERCE_ACCESS_TOKEN` | *(empty)* | Optional, same. Prefer the connection wizard, which encrypts. |

## Jobs

| Variable | Default | Notes |
| --- | --- | --- |
| `JOB_RUNNER_ENABLED` | `true` | Set `false` to disable background processing. |
| `JOB_RUNNER_POLL_MS` | `2000` | Poll interval. |
| `JOB_RUNNER_BATCH_SIZE` | `25` | Items per batch. |

## Logging

| Variable | Default | Notes |
| --- | --- | --- |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error`. `debug` logs every BigCommerce request — still redacted. |

## What is never an environment variable

Store credentials. They are entered through the connection wizard, encrypted with `ENCRYPTION_KEY` and stored
in the database. Putting a token in `.env` would mean one token for one store, which does not work for an
estate, and would put a live secret in a file that is easy to leak.
