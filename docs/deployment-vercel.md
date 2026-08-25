# Deploying to Vercel

> Deploying this build as-is would expose an application with no real authentication. Work through the
> [production-readiness checklist](production-readiness.md) first. If your organisation requires a review
> before external hosting, complete that process before deploying.

## What has to change first

SQLite does not work on Vercel — the filesystem is ephemeral and read-only at runtime. You need a hosted
PostgreSQL database (Vercel Postgres, Neon, Supabase, RDS) before anything else.

The in-process job runner also does not survive serverless invocations. Background work needs either a
durable queue or a scheduled function invoking `executeJob`.

## Steps

### 1. Move to PostgreSQL

Follow [the database guide](database.md#moving-to-postgresql). Commit the regenerated migrations.

### 2. Set environment variables

In the Vercel project settings:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Your PostgreSQL connection string (pooled) |
| `DIRECT_DATABASE_URL` | Direct connection, if your provider needs one for migrations |
| `ENCRYPTION_KEY` | 32-byte base64. **Generate a new one — never reuse the local key.** |
| `SESSION_SECRET` | 48-byte base64, likewise new |
| `NODE_ENV` | `production` |
| `APP_BASE_URL` | Your deployment URL |
| `COMMERCE_MODE` | `hybrid` or `connected` |
| `JOB_RUNNER_ENABLED` | `false` — the in-process runner is not suitable here |
| `LOG_LEVEL` | `info` |

Mark `ENCRYPTION_KEY` and `SESSION_SECRET` as sensitive. Better still, source them from a secret manager —
see [Security](security.md#credentials).

### 3. Build settings

The build command already runs `prisma generate`:

```json
"build": "prisma generate && next build"
```

Run migrations as a deploy step, not at build time:

```bash
npx prisma migrate deploy
```

### 4. Do not seed production

The seed clears existing data. It is for local development only.

### 5. Verify

- [ ] `/login` loads and the development-build banner reflects the real configuration
- [ ] Sign-in works (with your real identity provider, not the local adapter)
- [ ] The overview renders without a database error
- [ ] A connection test against a real store succeeds
- [ ] Server logs show no secret
- [ ] Security headers are present

## Serverless considerations

**Prisma connections.** Use your provider's pooled connection string. The client is memoised per process.

**Function timeouts.** Comparison scans across a large estate can exceed the default. Either raise
`maxDuration` on the affected routes or move the work to a queue.

**Cold starts.** The first request after idle is slow. Acceptable for an internal admin tool.

**No filesystem.** Nothing is written to disk at runtime. Theme package upload, if enabled later, would need
object storage.

## Alternatives worth considering

A long-running host — a container on Fly.io, Railway, Render or ECS — suits this application better. The job
runner works as designed, there are no cold starts, and function timeouts do not apply. The only change is
setting `JOB_RUNNER_ENABLED=true`.
