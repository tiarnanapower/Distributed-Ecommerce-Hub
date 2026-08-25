import { beforeAll, describe, expect, it } from 'vitest';

import {
  EnvelopeCipher,
  REDACTED,
  fingerprintSecret,
  maskSecret,
  redact,
  redactHeaders,
  redactString,
  redactUrl,
} from '@/lib/crypto/credentials';
import { maskEmail, maskPhone } from '@/lib/commerce/types';
import { summarise } from '@/server/services/audit';
import { resetEnvCache } from '@/lib/config';

const REAL_TOKEN = 'abc123def456ghi789jkl012mno345pq';

beforeAll(() => {
  // A deterministic key so encryption round-trips are testable.
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  process.env.SESSION_SECRET = 'test-session-secret-value-for-hmac-only';
  resetEnvCache();
});

describe('secret masking', () => {
  it('keeps only the last four characters', () => {
    expect(maskSecret(REAL_TOKEN)).toBe('••••••••45pq');
    expect(maskSecret(REAL_TOKEN)).not.toContain('abc123');
  });

  it('masks very short values entirely', () => {
    expect(maskSecret('ab')).toBe('••••');
  });

  it('produces a stable, non-reversible fingerprint', () => {
    const first = fingerprintSecret(REAL_TOKEN);
    expect(first).toBe(fingerprintSecret(REAL_TOKEN));
    expect(first).not.toContain(REAL_TOKEN.slice(0, 8));
    expect(first).toHaveLength(12);
    expect(fingerprintSecret('a-different-token')).not.toBe(first);
  });
});

describe('string redaction', () => {
  it('removes a token from a key=value pair', () => {
    expect(redactString(`access_token=${REAL_TOKEN}`)).toContain(REDACTED);
    expect(redactString(`access_token=${REAL_TOKEN}`)).not.toContain(REAL_TOKEN);
  });

  it('removes a token from JSON-ish text', () => {
    const input = `{"accessToken": "${REAL_TOKEN}", "storeHash": "abc123"}`;
    expect(redactString(input)).not.toContain(REAL_TOKEN);
  });

  it('removes bearer tokens', () => {
    expect(redactString('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def')).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  it('removes long opaque strings that look like credentials', () => {
    expect(redactString(`the value is ${REAL_TOKEN} apparently`)).not.toContain(REAL_TOKEN);
  });

  it('leaves ordinary prose alone', () => {
    const message = 'The store could not be reached because the network timed out.';
    expect(redactString(message)).toBe(message);
  });
});

describe('object redaction', () => {
  it('removes secret-named keys at any depth', () => {
    const input = {
      storeHash: 'abc123',
      connection: { accessToken: REAL_TOKEN, clientSecret: 'shhh' },
      nested: { deeper: { apiKey: 'k' } },
    };
    const output = redact(input) as typeof input;
    expect(output.connection.accessToken).toBe(REDACTED);
    expect(output.connection.clientSecret).toBe(REDACTED);
    expect(output.nested.deeper.apiKey).toBe(REDACTED);
    // Non-secret fields survive.
    expect(output.storeHash).toBe('abc123');
  });

  it('redacts a whole object whose own key names a secret', () => {
    // `credentials` is itself a secret-shaped key, so the entire subtree goes
    // rather than being walked into.
    const output = redact({ credentials: { accessToken: REAL_TOKEN } }) as Record<string, unknown>;
    expect(output.credentials).toBe(REDACTED);
  });

  it('handles arrays', () => {
    const output = redact([{ token: 'a' }, { token: 'b' }]) as { token: string }[];
    expect(output[0]!.token).toBe(REDACTED);
    expect(output[1]!.token).toBe(REDACTED);
  });

  it('reduces an Error to a safe shape', () => {
    const output = redact(new Error(`failed with token=${REAL_TOKEN}`)) as { message: string };
    expect(output.message).not.toContain(REAL_TOKEN);
  });

  it('stops at a sane depth rather than recursing forever', () => {
    type Deep = { next?: Deep; token?: string };
    let deep: Deep = { token: 'secret' };
    for (let index = 0; index < 20; index += 1) deep = { next: deep };
    expect(() => redact(deep)).not.toThrow();
  });

  it('preserves Dates', () => {
    const date = new Date('2026-01-01');
    expect(redact({ when: date })).toEqual({ when: date });
  });
});

describe('header and URL redaction', () => {
  it('removes the auth header', () => {
    const output = redactHeaders({ 'X-Auth-Token': REAL_TOKEN, Accept: 'application/json' });
    expect(output['X-Auth-Token']).toBe(REDACTED);
    expect(output.Accept).toBe('application/json');
  });

  it('works with a Headers instance', () => {
    const headers = new Headers({ 'x-auth-token': REAL_TOKEN, 'content-type': 'application/json' });
    const output = redactHeaders(headers);
    expect(output['x-auth-token']).toBe(REDACTED);
  });

  it('removes secret query parameters from a URL', () => {
    const output = redactUrl(`https://api.bigcommerce.com/stores/abc/v3/catalog?access_token=${REAL_TOKEN}`);
    expect(output).not.toContain(REAL_TOKEN);
    expect(output).toContain('api.bigcommerce.com');
  });

  it('degrades gracefully on a malformed URL', () => {
    expect(() => redactUrl('not a url at all')).not.toThrow();
  });
});

describe('personal data masking', () => {
  it('masks an email but keeps the domain', () => {
    const masked = maskEmail('amelia.whitfield@example.com');
    expect(masked).toBe('a******d@example.com');
    expect(masked).not.toContain('amelia.whitfield');
    // The asterisk run is capped so the mask does not leak the local part's length.
    expect(maskEmail('a.very.much.longer.local.part@example.com')).toBe('a******t@example.com');
  });

  it('handles short local parts and missing values', () => {
    expect(maskEmail('ab@example.com')).toBe('a@example.com');
    expect(maskEmail(null)).toBe('—');
    expect(maskEmail('not-an-email')).toBe('••••');
  });

  it('masks a phone number to the last three digits', () => {
    expect(maskPhone('+44 20 7946 0958')).toBe('••• ••• 958');
    expect(maskPhone(null)).toBeNull();
  });
});

describe('audit summarisation', () => {
  it('never lets a secret into an audit summary', () => {
    const summary = summarise({ accessToken: REAL_TOKEN, storeHash: 'abc123' });
    expect(summary).not.toContain(REAL_TOKEN);
    expect(summary).toContain('storeHash=abc123');
  });

  it('collapses nested structures rather than dumping them', () => {
    const summary = summarise({ targets: [1, 2, 3], config: { a: 1 } });
    expect(summary).toContain('[3 items]');
    expect(summary).toContain('{…}');
  });

  it('returns null for nothing', () => {
    expect(summarise(null)).toBeNull();
    expect(summarise(undefined)).toBeNull();
  });

  it('truncates very long values', () => {
    const summary = summarise({ note: 'x'.repeat(1000) });
    expect(summary!.length).toBeLessThanOrEqual(500);
  });
});

describe('credential encryption', () => {
  const cipher = new EnvelopeCipher();

  it('round-trips a secret', () => {
    const sealed = cipher.seal(REAL_TOKEN);
    expect(cipher.open(sealed)).toBe(REAL_TOKEN);
  });

  it('never stores the plaintext in the sealed payload', () => {
    const sealed = cipher.seal(REAL_TOKEN);
    expect(sealed.ciphertext).not.toContain(REAL_TOKEN);
    expect(Buffer.from(sealed.ciphertext, 'base64').toString('utf8')).not.toContain(REAL_TOKEN);
  });

  it('produces a different ciphertext each time, via a fresh IV', () => {
    const first = cipher.seal(REAL_TOKEN);
    const second = cipher.seal(REAL_TOKEN);
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(first.iv).not.toBe(second.iv);
    // Both still decrypt correctly.
    expect(cipher.open(first)).toBe(cipher.open(second));
  });

  it('rejects a tampered ciphertext rather than returning garbage', () => {
    const sealed = cipher.seal(REAL_TOKEN);
    const tampered = { ...sealed, ciphertext: Buffer.from('tampered').toString('base64') };
    expect(() => cipher.open(tampered)).toThrow();
  });

  it('rejects a tampered auth tag', () => {
    const sealed = cipher.seal(REAL_TOKEN);
    const tampered = { ...sealed, authTag: Buffer.alloc(16, 1).toString('base64') };
    expect(() => cipher.open(tampered)).toThrow();
  });

  it('gives a vague failure message that reveals nothing', () => {
    const sealed = cipher.seal(REAL_TOKEN);
    try {
      cipher.open({ ...sealed, authTag: Buffer.alloc(16, 1).toString('base64') });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as Error).message).not.toContain(REAL_TOKEN);
      expect((error as Error).message).toContain('could not be decrypted');
    }
  });
});
