# Security notes

This build is a local development tool. It takes credential handling seriously because getting that wrong
teaches bad habits, but several other primitives are deliberately local-only. Read
[Known limitations](known-limitations.md) alongside this.

## Credentials

**At rest.** BigCommerce tokens are encrypted with AES-256-GCM before they touch the database. The key comes
from `ENCRYPTION_KEY`. Each record stores its own IV and auth tag, so the same token sealed twice produces
different ciphertext, and tampering fails to decrypt rather than returning garbage.

**In use.** Plaintext exists in exactly two places: the request that stores it, and the in-memory value handed
to the HTTP client at the moment of an outbound call. It is never cached.

**On display.** No route returns a secret. The UI shows a masked hint (`••••••••7f2a`) and a 12-character
fingerprint so an operator can confirm *which* token is in use without it being retrievable.

**Rotation.** Storing a new token marks the previous record `ROTATED` rather than deleting it, preserving the
audit trail, and immediately re-tests the connection so a bad paste is caught at once.

**Production.** `EnvelopeCipher` implements a `Cipher` interface precisely so it can be replaced by a
KMS-backed implementation in one file. An environment-variable key is adequate for a laptop and nothing more:
the key sits in the same environment as the ciphertext, so a host compromise exposes both.

## Redaction

Everything that could reach a log, an error message or an audit row passes through `redact()` first. It
removes values by key name (`accessToken`, `clientSecret`, `authorization`, `password`, `apiKey`, `token`,
`credential`, `cookie`…) and by shape (bearer tokens, long opaque strings), recursively, with a depth guard.

Value-shaped patterns are applied **before** key-based ones. That ordering is not cosmetic: with the reverse
order, `Authorization: Bearer <jwt>` had the word `Bearer` replaced and the token left in the clear. There is
a regression test for exactly that case.

Request headers are redacted before logging, and query strings are stripped of secret-shaped parameters. Full
access tokens, client secrets, customer personal data and payment information are never logged.

## Sessions

The cookie carries a 32-byte random token and nothing else — no user id, no role, no organisation. Only its
SHA-256 hash is stored, so a database leak cannot be used to mint sessions.

Cookies are `httpOnly`, `sameSite=lax`, and `secure` in production. Sessions expire, can be revoked, and
record a hashed IP and user agent. Authorization always re-reads the database rather than trusting anything
in the cookie.

## Tenant isolation

Every tenant-scoped query is built from a `TenantScope` derived from the session, through `tenantWhere()`.
Single records go through `assertTenantAccess`, which returns **the same "could not be found" message** for a
cross-tenant record as for a genuine miss. The real reason is kept server-side. Without that, the API would be
an existence oracle for other organisations' ids.

Scope selections made in the header are validated against the tenant before being written to the session, so a
crafted request cannot pin a session to another organisation's store.

## Personal data

The platform stores as little as it can function with:

- **Emails** — masked for display (`a******d@example.com`) plus a salted HMAC hash. The hash exists only so
  the same address appearing in two stores can be *reported*. Identities are never merged.
- **Phone numbers** — masked to the last three digits.
- **Addresses** — not stored at all. Fetched on demand when an order is opened.
- **Payment data** — never read, stored or displayed. Only the gateway's reported status and the amount.
- **IP addresses** — stored as a keyed HMAC, never in the clear.

Customers stay scoped to the store they belong to. Two accounts sharing an email in different stores may be
the same person or may not, and those stores may sit under different legal entities with different consent —
merging them automatically is a data-protection decision this platform is not entitled to make.

## Input validation

Every server action and route handler validates its input with Zod before anything reaches the database.
Responses from BigCommerce are validated too: an unrecognised shape fails the read rather than propagating
`undefined`.

## Errors

`AppError` carries a stable code, an operator-safe message guaranteed free of secrets, and a `detail` that is
only ever logged server-side. Error boundaries render a generic message and a digest — a stack trace never
reaches the browser, so it cannot leak a store hash or an internal path.

## Destructive actions

Nothing destructive happens without:

1. a dry-run producing a full change plan;
2. a blast-radius summary naming the stores, records and destructive changes;
3. a typed confirmation phrase for destructive or wide-reaching plans;
4. an audit entry regardless of outcome.

Refunds are excluded from automation entirely. They move real money and cannot be undone, so the platform
links to the BigCommerce control panel instead.

## HTTP headers

`next.config.mjs` sets `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a strict
`Referrer-Policy` and a `Permissions-Policy` disabling camera, microphone, geolocation and payment.

**A Content Security Policy is not configured.** Adding one is on the
[production-readiness checklist](production-readiness.md); it needs a nonce-based approach because Next.js
injects inline scripts for hydration.

## Rate limiting

Outbound rate limiting against BigCommerce is implemented (documented headers, backoff on 429). **Inbound**
rate limiting on this application's own routes is not — the abstraction exists in the error taxonomy
(`RATE_LIMITED`) but there is no limiter. With local authentication and a single user this is moot; with a
real identity provider it is not.

## Dependencies

`npm audit` should be part of CI. This build pins Next.js to a patched release after `npm install` flagged
CVE-2025-66478 in the version originally selected. Re-check before any deployment:

```bash
npm audit --omit=dev
```

## What this build does not do

- No MFA, password policy or account lockout — there are no passwords.
- No CSRF token. Server actions are same-origin POSTs and cookies are `sameSite=lax`, which covers the common
  cases, but a real deployment behind a real identity provider should add explicit CSRF protection.
- No inbound rate limiting.
- No Content Security Policy.
- No secret rotation schedule or key versioning beyond the `keyVersion` column.
- No penetration test.
