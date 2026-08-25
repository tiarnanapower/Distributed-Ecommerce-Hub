import { describe, expect, it } from 'vitest';

import { BigCommerceApiError, mapBigCommerceError, parseRateLimit } from '@/lib/commerce/bigcommerce/client';

const endpoint = 'catalog/products';

describe('error mapping', () => {
  it('maps 401 to an invalid-credential error with a rotation hint', () => {
    const error = mapBigCommerceError(401, endpoint, { title: 'Unauthorized' });
    expect(error.code).toBe('CREDENTIAL_INVALID');
    expect(error.status).toBe(401);
    expect(error.hint).toContain('Rotate the credential');
  });

  it('maps 403 to a capability problem, not an auth failure', () => {
    // 403 means the token is valid but lacks a scope — a different fix from 401.
    const error = mapBigCommerceError(403, endpoint, { title: 'Forbidden' });
    expect(error.code).toBe('CAPABILITY_UNAVAILABLE');
    expect(error.hint).toContain('OAuth scope');
  });

  it('maps 404 and explains that ids are store-local', () => {
    const error = mapBigCommerceError(404, endpoint, {});
    expect(error.code).toBe('NOT_FOUND');
    expect(error.hint).toContain('store-local');
  });

  it('maps 409 to a conflict and names the likely cause', () => {
    const error = mapBigCommerceError(409, endpoint, {});
    expect(error.code).toBe('CONFLICT');
    expect(error.hint).toContain('unique value');
  });

  it('maps 413 to a validation failure suggesting a smaller batch', () => {
    const error = mapBigCommerceError(413, endpoint, {});
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.hint).toContain('batch size');
  });

  it('maps 422 and surfaces the field errors', () => {
    const error = mapBigCommerceError(422, endpoint, {
      title: 'Invalid',
      errors: { 'products.0.sku': 'sku must be unique', 'products.0.price': 'must be positive' },
    });
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.hint).toContain('sku must be unique');
    expect(error.bigCommerceErrors).toMatchObject({ 'products.0.sku': 'sku must be unique' });
  });

  it('maps 429 to rate limiting and says it will retry', () => {
    const error = mapBigCommerceError(429, endpoint, {});
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.status).toBe(429);
    expect(error.hint).toContain('back off and retry');
  });

  it('maps 5xx to an upstream error described as transient', () => {
    for (const status of [500, 502, 503, 504]) {
      const error = mapBigCommerceError(status, endpoint, {});
      expect(error.code).toBe('UPSTREAM_ERROR');
      expect(error.hint).toContain('transient');
    }
  });

  it('falls back sensibly for an unexpected status', () => {
    const error = mapBigCommerceError(418, endpoint, {});
    expect(error.code).toBe('UPSTREAM_ERROR');
    expect(error.message).toContain('418');
  });

  it('records the endpoint for diagnosis', () => {
    expect(mapBigCommerceError(500, 'orders/123', {}).endpoint).toBe('orders/123');
  });

  it('is an AppError, so route handlers can serialise it uniformly', () => {
    const error = mapBigCommerceError(401, endpoint, {});
    expect(error).toBeInstanceOf(BigCommerceApiError);
    expect(error.toPublicJSON().error.code).toBe('CREDENTIAL_INVALID');
  });

  it('never leaks a token that appeared in the upstream payload', () => {
    const token = 'abc123def456ghi789jkl012mno345pq';
    const error = mapBigCommerceError(422, endpoint, { title: `bad token ${token}` });
    expect(JSON.stringify(error.toPublicJSON())).not.toContain(token);
    expect(error.detail ?? '').not.toContain(token);
  });

  it('reads a message from several upstream shapes', () => {
    expect(mapBigCommerceError(422, endpoint, { title: 'From title' }).detail).toContain('From title');
    expect(mapBigCommerceError(422, endpoint, { message: 'From message' }).detail).toContain('From message');
    expect(
      mapBigCommerceError(422, endpoint, { errors: [{ message: 'From array' }] }).detail,
    ).toContain('From array');
  });

  it('copes with a payload that is not an object', () => {
    expect(() => mapBigCommerceError(500, endpoint, null)).not.toThrow();
    expect(() => mapBigCommerceError(500, endpoint, 'plain text')).not.toThrow();
  });
});

describe('rate-limit header parsing', () => {
  it('reads the documented BigCommerce headers', () => {
    const headers = new Headers({
      'X-Rate-Limit-Requests-Quota': '150',
      'X-Rate-Limit-Requests-Left': '42',
      'X-Rate-Limit-Time-Window-Ms': '30000',
      'X-Rate-Limit-Time-Reset-Ms': '12000',
    });
    const snapshot = parseRateLimit(headers);
    expect(snapshot).toMatchObject({ quota: 150, remaining: 42, windowMs: 30_000, resetMs: 12_000 });
    expect(snapshot.observedAt).toBeInstanceOf(Date);
  });

  it('returns nulls when the headers are absent, rather than guessing', () => {
    const snapshot = parseRateLimit(new Headers());
    expect(snapshot.quota).toBeNull();
    expect(snapshot.remaining).toBeNull();
    expect(snapshot.resetMs).toBeNull();
  });

  it('ignores non-numeric header values', () => {
    const snapshot = parseRateLimit(new Headers({ 'X-Rate-Limit-Requests-Left': 'unlimited' }));
    expect(snapshot.remaining).toBeNull();
  });

  it('treats a zero remaining quota as zero, not missing', () => {
    const snapshot = parseRateLimit(new Headers({ 'X-Rate-Limit-Requests-Left': '0' }));
    expect(snapshot.remaining).toBe(0);
  });
});
