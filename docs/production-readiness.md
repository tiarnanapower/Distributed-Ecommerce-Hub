# Production-readiness checklist

This build is a development tool. Everything below must be addressed before it manages a live estate.

## Blocking — do not deploy without these

### Authentication and identity
- [ ] Replace `LocalAuthAdapter` with a real identity provider (Auth.js, Entra ID, Okta, Google Workspace,
      SAML or OIDC). Implement `AuthAdapter`; no other application code changes.
- [ ] Enforce MFA.
- [ ] Provision users from the identity provider rather than the seed.
- [ ] Assign real roles. Every user is currently `COMPANY_ADMIN`, so a requester can approve their own
      deployment. The role matrix already separates `deployment:create` from `deployment:approve`.
- [ ] Add session revocation on identity-provider logout.

### Secrets
- [ ] Move `ENCRYPTION_KEY` into a managed KMS or secret manager. Replace `EnvelopeCipher` with a KMS-backed
      `Cipher` implementation — one file.
- [ ] Establish a key-rotation procedure. The `keyVersion` column exists; the re-encryption job does not.
- [ ] Move `SESSION_SECRET` into the same secret manager.
- [ ] Confirm no secret is in any committed file. `.env` is gitignored.

### Database
- [ ] Move to PostgreSQL. Change the Prisma datasource, regenerate migrations, optionally convert the string
      enum columns to native enums and the JSON-text columns to `jsonb`.
- [ ] Convert money columns to `Decimal(19,4)`.
- [ ] Configure automated backups and point-in-time recovery.
- [ ] Set connection pooling appropriate to the host.
- [ ] Review indexes against real query patterns.

### Background work
- [ ] Replace the in-process runner with a durable queue (BullMQ, SQS, Cloud Tasks, Vercel Queues).
      Implement `JobQueue` and call the exported `executeJob(jobId)` from a worker.
- [ ] Add dead-letter handling and alerting on repeated failure.
- [ ] Re-enable scheduled comparison scans once the queue is durable.

## Before enabling write operations

Writes are deliberately disabled. Before turning any on:

- [ ] Verify the capability per store against a real API account, not the static registry.
- [ ] Implement the write path in `BigCommerceProvider` with response validation.
- [ ] Capture a pre-change snapshot for every item so rollback is real rather than notional.
- [ ] Require approval by policy for the category.
- [ ] Rehearse on a staging store first.
- [ ] Confirm rate-limit behaviour under a realistic batch size.
- [ ] Test partial failure: half the batch applied, half not.
- [ ] Update the capability registry's `defaultStatus` and add tests.

Do not enable refunds. They move real money and cannot be undone.

## Security hardening

- [ ] Add a Content Security Policy. Needs a nonce-based approach for Next.js hydration scripts.
- [ ] Add inbound rate limiting on routes and server actions.
- [ ] Add explicit CSRF protection for mutations.
- [ ] Run `npm audit` in CI and fail the build on high-severity findings.
- [ ] Enable Dependabot or equivalent.
- [ ] Commission a penetration test covering tenant isolation specifically.
- [ ] Review the audit-log retention period against your regulatory obligations.
- [ ] Confirm the lawful basis for the customer email hash with your DPO.

## Operations

- [ ] Ship structured logs to a real aggregator. Correlation ids are already threaded through.
- [ ] Add error tracking (Sentry or similar) wired to `AppError`.
- [ ] Add uptime and health checks.
- [ ] Alert on: credential failures, job failure rate, deployment failures, conflict growth.
- [ ] Define an on-call runbook for a failed cross-store deployment.
- [ ] Load-test the comparison engine against a realistic catalogue size.

## Data protection

- [ ] Complete a DPIA. Customer data is minimised but not absent.
- [ ] Confirm the retention policy and implement automatic pruning — the policies are documented under
      Settings → Data retention but not enforced.
- [ ] Confirm the lawful basis for cross-store customer reporting, especially across legal entities.
- [ ] Document the sub-processor relationship with BigCommerce.
- [ ] Implement subject-access and erasure request handling.

## Testing

- [ ] Raise unit coverage on the service layer. Domain logic is well covered; services are thinner.
- [ ] Add contract tests against a BigCommerce sandbox.
- [ ] Add load tests for the comparison and deployment paths.
- [ ] Add accessibility tests (axe) to the e2e suite.
- [ ] Test the PostgreSQL migration path end to end.

## Product gaps to close

- [ ] Editing forms for organisation, company, region, brand and template records.
- [ ] CSV import to match the existing export.
- [ ] Creating and editing saved views from the UI.
- [ ] File-level theme diffing.
- [ ] Multi-organisation support in the UI.

## Verifying the current build

```bash
npm run verify        # typecheck, lint, unit tests
npm run test:e2e      # end-to-end
npm run build         # production build
node scripts/smoke-routes.mjs
```
