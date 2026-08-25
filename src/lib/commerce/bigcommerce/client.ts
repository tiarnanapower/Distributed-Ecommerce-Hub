/**
 * Typed BigCommerce REST client.
 *
 * The only place in the codebase that calls `fetch` against BigCommerce.
 * Responsibilities:
 *  * base-URL construction for v2 and v3;
 *  * the `X-Auth-Token` header, never logged;
 *  * rate-limit awareness using the documented `X-Rate-Limit-*` headers;
 *  * bounded retries with exponential backoff and jitter on 429/5xx/network;
 *  * request timeouts;
 *  * structured, redacted errors;
 *  * correlation ids threaded through every log line;
 *  * runtime validation of responses the application depends on.
 *
 * Rate-limit and 429 behaviour follow the BigCommerce "API rate limits"
 * guidance: read `X-Rate-Limit-Time-Reset-Ms` and wait before retrying.
 */
import { z } from 'zod';

import { env } from '@/lib/config';
import { AppError, type AppErrorCode } from '@/lib/errors';
import { logger, newCorrelationId } from '@/lib/logger';
import { redactHeaders, redactUrl } from '@/lib/crypto/credentials';

export interface BigCommerceCredentials {
  storeHash: string;
  accessToken: string;
  /** Optional; only needed for app-style OAuth flows, not for API accounts. */
  clientId?: string;
}

export interface RateLimitSnapshot {
  quota: number | null;
  remaining: number | null;
  windowMs: number | null;
  resetMs: number | null;
  observedAt: Date;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** API version segment. v2 and v3 have different envelope shapes. */
  version?: 'v2' | 'v3';
  query?: Record<string, string | number | boolean | undefined | null | (string | number)[]>;
  body?: unknown;
  /** Overrides the default timeout for slow endpoints. */
  timeoutMs?: number;
  correlationId?: string;
  /** Skips retries — used by the connection test so failures surface fast. */
  noRetry?: boolean;
}

export interface BigCommerceResponse<T> {
  data: T;
  /** v3 responses carry a meta envelope; v2 does not. */
  meta: {
    pagination?: {
      total: number;
      count: number;
      perPage: number;
      currentPage: number;
      totalPages: number;
    };
  } | null;
  rateLimit: RateLimitSnapshot;
  status: number;
}

export class BigCommerceApiError extends AppError {
  readonly httpStatus: number;
  readonly endpoint: string;
  readonly bigCommerceErrors: Record<string, string> | null;

  constructor(options: {
    code: AppErrorCode;
    message: string;
    httpStatus: number;
    endpoint: string;
    detail?: string;
    hint?: string;
    bigCommerceErrors?: Record<string, string> | null;
  }) {
    super(options.code, options.message, {
      status: options.httpStatus,
      detail: options.detail,
      hint: options.hint,
    });
    this.name = 'BigCommerceApiError';
    this.httpStatus = options.httpStatus;
    this.endpoint = options.endpoint;
    this.bigCommerceErrors = options.bigCommerceErrors ?? null;
  }
}

/**
 * Maps a BigCommerce HTTP failure onto the application error taxonomy with a
 * message an operator can act on. Kept pure and exported so it can be tested
 * without a network.
 */
export function mapBigCommerceError(
  status: number,
  endpoint: string,
  payload: unknown,
): BigCommerceApiError {
  const title = extractTitle(payload);
  const errors = extractErrors(payload);

  switch (status) {
    case 401:
      return new BigCommerceApiError({
        code: 'CREDENTIAL_INVALID',
        message: 'BigCommerce rejected the access token for this store.',
        hint: 'The token may have been revoked or regenerated. Rotate the credential on the store’s Credentials tab.',
        httpStatus: status,
        endpoint,
        detail: title,
        bigCommerceErrors: errors,
      });
    case 403:
      return new BigCommerceApiError({
        code: 'CAPABILITY_UNAVAILABLE',
        message: 'The API account does not have permission for this operation.',
        hint: 'Add the required OAuth scope to the API account in the BigCommerce control panel, then re-run the capability check.',
        httpStatus: status,
        endpoint,
        detail: title,
        bigCommerceErrors: errors,
      });
    case 404:
      return new BigCommerceApiError({
        code: 'NOT_FOUND',
        message: 'BigCommerce reported that this resource does not exist.',
        hint: 'Resource ids are store-local. Check the mapping between the source and target store.',
        httpStatus: status,
        endpoint,
        detail: title,
        bigCommerceErrors: errors,
      });
    case 409:
      return new BigCommerceApiError({
        code: 'CONFLICT',
        message: 'BigCommerce rejected the change because it conflicts with existing data.',
        hint: 'A unique value such as a SKU, URL or group name is probably already in use in the target store.',
        httpStatus: status,
        endpoint,
        detail: title,
        bigCommerceErrors: errors,
      });
    case 413:
      return new BigCommerceApiError({
        code: 'VALIDATION_FAILED',
        message: 'The request payload was too large for BigCommerce to accept.',
        hint: 'Reduce the batch size for this job.',
        httpStatus: status,
        endpoint,
        detail: title,
        bigCommerceErrors: errors,
      });
    case 422:
      return new BigCommerceApiError({
        code: 'VALIDATION_FAILED',
        message: 'BigCommerce rejected the payload as invalid.',
        hint: errors
          ? `Field errors: ${Object.entries(errors)
              .map(([field, detail]) => `${field} — ${detail}`)
              .join('; ')
              .slice(0, 300)}`
          : 'Check the field values against the API reference for this resource.',
        httpStatus: status,
        endpoint,
        detail: title,
        bigCommerceErrors: errors,
      });
    case 429:
      return new BigCommerceApiError({
        code: 'RATE_LIMITED',
        message: 'BigCommerce rate-limited this store.',
        hint: 'The job will back off and retry automatically. Reduce concurrency if this recurs.',
        httpStatus: status,
        endpoint,
        detail: title,
        bigCommerceErrors: errors,
      });
    default:
      if (status >= 500) {
        return new BigCommerceApiError({
          code: 'UPSTREAM_ERROR',
          message: 'BigCommerce returned a server error.',
          hint: 'This is usually transient. The job will retry; check the BigCommerce status page if it persists.',
          httpStatus: status,
          endpoint,
          detail: title,
          bigCommerceErrors: errors,
        });
      }
      return new BigCommerceApiError({
        code: 'UPSTREAM_ERROR',
        message: `BigCommerce returned an unexpected ${status} response.`,
        httpStatus: status,
        endpoint,
        detail: title,
        bigCommerceErrors: errors,
      });
  }
}

function extractTitle(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const record = payload as Record<string, unknown>;
  if (typeof record.title === 'string') return record.title;
  if (typeof record.message === 'string') return record.message;
  if (Array.isArray(record.errors) && record.errors.length > 0) {
    const first = record.errors[0] as Record<string, unknown>;
    if (typeof first?.message === 'string') return first.message;
  }
  return undefined;
}

function extractErrors(payload: unknown): Record<string, string> | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  if (record.errors && typeof record.errors === 'object' && !Array.isArray(record.errors)) {
    return Object.fromEntries(
      Object.entries(record.errors as Record<string, unknown>).map(([key, value]) => [
        key,
        String(value),
      ]),
    );
  }
  return null;
}

export function parseRateLimit(headers: Headers): RateLimitSnapshot {
  const num = (name: string): number | null => {
    const raw = headers.get(name);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  return {
    quota: num('X-Rate-Limit-Requests-Quota'),
    remaining: num('X-Rate-Limit-Requests-Left'),
    windowMs: num('X-Rate-Limit-Time-Window-Ms'),
    resetMs: num('X-Rate-Limit-Time-Reset-Ms'),
    observedAt: new Date(),
  };
}

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

function backoffDelayMs(attempt: number, rateLimit: RateLimitSnapshot | null): number {
  // Honour the documented reset header when BigCommerce supplies it.
  if (rateLimit?.resetMs && rateLimit.resetMs > 0) {
    return Math.min(rateLimit.resetMs + 250, 35_000);
  }
  const base = Math.min(500 * 2 ** attempt, 15_000);
  return base + Math.floor(Math.random() * 250);
}

export class BigCommerceClient {
  private readonly credentials: BigCommerceCredentials;
  private readonly connectionId: string;
  private lastRateLimit: RateLimitSnapshot | null = null;

  constructor(credentials: BigCommerceCredentials, connectionId: string) {
    this.credentials = credentials;
    this.connectionId = connectionId;
  }

  get rateLimit(): RateLimitSnapshot | null {
    return this.lastRateLimit;
  }

  private buildUrl(path: string, options: RequestOptions): string {
    const version = options.version ?? 'v3';
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    const url = new URL(
      `${env().BIGCOMMERCE_API_HOST}/stores/${this.credentials.storeHash}/${version}/${cleanPath}`,
    );
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, Array.isArray(value) ? value.join(',') : String(value));
    }
    return url.toString();
  }

  async request<T = unknown>(path: string, options: RequestOptions = {}): Promise<BigCommerceResponse<T>> {
    if (env().DISABLE_OUTBOUND_API) {
      throw new AppError(
        'OUTBOUND_DISABLED',
        'Outbound BigCommerce API calls are disabled in this environment.',
        { hint: 'Unset DISABLE_OUTBOUND_API to allow live reads.' },
      );
    }

    const correlationId = options.correlationId ?? newCorrelationId('bc');
    const url = this.buildUrl(path, options);
    const method = options.method ?? 'GET';
    const timeoutMs = options.timeoutMs ?? env().BIGCOMMERCE_REQUEST_TIMEOUT_MS;
    const maxAttempts = options.noRetry ? 1 : env().BIGCOMMERCE_MAX_RETRIES + 1;
    const log = logger.child({ correlationId, connectionId: this.connectionId });

    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (attempt > 0) {
        const delay = backoffDelayMs(attempt - 1, this.lastRateLimit);
        log.warn('Retrying BigCommerce request', {
          endpoint: redactUrl(url),
          attempt: attempt + 1,
          delayMs: delay,
        });
        await sleep(delay);
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const startedAt = Date.now();

      try {
        const headers: Record<string, string> = {
          'X-Auth-Token': this.credentials.accessToken,
          Accept: 'application/json',
          'User-Agent': 'CommerceCommandCenter/0.1 (+local)',
        };
        if (options.body !== undefined) headers['Content-Type'] = 'application/json';

        const response = await fetch(url, {
          method,
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: controller.signal,
          cache: 'no-store',
        });

        this.lastRateLimit = parseRateLimit(response.headers);
        const durationMs = Date.now() - startedAt;

        // Never log the request headers — they carry the token.
        log.debug('BigCommerce request completed', {
          endpoint: redactUrl(url),
          method,
          status: response.status,
          durationMs,
          rateLimitRemaining: this.lastRateLimit.remaining,
          responseHeaders: redactHeaders(response.headers),
        });

        const payload = await readJson(response);

        if (!response.ok) {
          const error = mapBigCommerceError(response.status, path, payload);
          if (RETRYABLE_STATUSES.has(response.status) && attempt < maxAttempts - 1) {
            lastError = error;
            continue;
          }
          throw error;
        }

        return {
          data: unwrapData<T>(payload, options.version ?? 'v3'),
          meta: unwrapMeta(payload),
          rateLimit: this.lastRateLimit,
          status: response.status,
        };
      } catch (error) {
        if (error instanceof BigCommerceApiError) {
          if (!RETRYABLE_STATUSES.has(error.httpStatus) || attempt === maxAttempts - 1) throw error;
          lastError = error;
          continue;
        }
        if (error instanceof AppError) throw error;

        const isAbort = error instanceof Error && error.name === 'AbortError';
        lastError = isAbort
          ? new AppError('TIMEOUT', `BigCommerce did not respond within ${timeoutMs}ms.`, {
              hint: 'Increase BIGCOMMERCE_REQUEST_TIMEOUT_MS or reduce the page size for this endpoint.',
            })
          : new AppError('UPSTREAM_ERROR', 'Could not reach the BigCommerce API.', {
              detail: error instanceof Error ? error.message : String(error),
              hint: 'Check network connectivity and that the store hash is correct.',
            });

        if (attempt === maxAttempts - 1) throw lastError;
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new AppError('UPSTREAM_ERROR', 'The BigCommerce request failed.');
  }

  /**
   * Validates a response against a Zod schema, producing a clear error if the
   * API shape drifts. The generic is the schema itself rather than its output
   * type, so schemas that transform (numbers to decimal strings, strings to
   * Dates) infer correctly at the call site.
   */
  async requestValidated<S extends z.ZodTypeAny>(
    path: string,
    schema: S,
    options: RequestOptions = {},
  ): Promise<{
    data: z.infer<S>;
    meta: BigCommerceResponse<unknown>['meta'];
    rateLimit: RateLimitSnapshot;
  }> {
    const response = await this.request<unknown>(path, options);
    const parsed = schema.safeParse(response.data);
    if (!parsed.success) {
      throw new AppError(
        'UPSTREAM_ERROR',
        'BigCommerce returned a response this platform did not recognise.',
        {
          detail: `${path}: ${parsed.error.issues
            .slice(0, 5)
            .map((issue) => `${issue.path.join('.')} ${issue.message}`)
            .join('; ')}`,
          hint: 'The API response shape may have changed. This read has been skipped rather than guessed at.',
        },
      );
    }
    return { data: parsed.data, meta: response.meta, rateLimit: response.rateLimit };
  }

  /**
   * Walks a v3 paginated collection, respecting rate limits between pages.
   * `maxItems` bounds memory for large catalogs.
   */
  async *paginate<S extends z.ZodTypeAny>(
    path: string,
    schema: S,
    options: RequestOptions & { pageSize?: number; maxItems?: number } = {},
  ): AsyncGenerator<z.infer<S>, void, undefined> {
    const pageSize = options.pageSize ?? 100;
    let page = 1;
    let yielded = 0;

    for (;;) {
      const { data, meta } = await this.requestValidated(path, schema, {
        ...options,
        query: { ...options.query, page, limit: pageSize },
      });

      const batch = data as unknown[];
      if (batch.length === 0) return;
      yield data;
      yielded += batch.length;

      if (options.maxItems && yielded >= options.maxItems) return;
      const pagination = meta?.pagination;
      if (!pagination || page >= pagination.totalPages) return;
      page += 1;

      // Slow down proactively when the remaining quota gets thin.
      if (this.lastRateLimit?.remaining !== null && (this.lastRateLimit?.remaining ?? 99) < 5) {
        await sleep(Math.min(this.lastRateLimit?.resetMs ?? 1_000, 30_000));
      }
    }
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { title: text.slice(0, 300) };
  }
}

function unwrapData<T>(payload: unknown, version: 'v2' | 'v3'): T {
  if (version === 'v2') return payload as T;
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function unwrapMeta(payload: unknown): BigCommerceResponse<unknown>['meta'] {
  if (!payload || typeof payload !== 'object') return null;
  const meta = (payload as Record<string, unknown>).meta;
  if (!meta || typeof meta !== 'object') return null;
  const pagination = (meta as Record<string, unknown>).pagination as
    | Record<string, number>
    | undefined;
  if (!pagination) return {};
  return {
    pagination: {
      total: pagination.total ?? 0,
      count: pagination.count ?? 0,
      perPage: pagination.per_page ?? 0,
      currentPage: pagination.current_page ?? 1,
      totalPages: pagination.total_pages ?? 1,
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
