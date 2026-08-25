/**
 * Credential encryption at rest.
 *
 * Local development uses AES-256-GCM with a key supplied through
 * `ENCRYPTION_KEY`. That is adequate for a laptop and nothing more: the key
 * sits in the same environment as the ciphertext, so a host compromise exposes
 * both. Production deployments must swap `EnvelopeCipher` for a KMS-backed
 * implementation — the interface exists precisely so that is a one-file change.
 * See docs/security.md.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { env } from '@/lib/config';
import { sha256 } from './hash';

export interface SealedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
  algorithm: string;
  keyVersion: number;
}

export interface Cipher {
  seal(plaintext: string): SealedSecret;
  open(sealed: SealedSecret): string;
  readonly keyVersion: number;
  readonly algorithm: string;
}

export class EncryptionKeyMissingError extends Error {
  constructor() {
    super(
      'ENCRYPTION_KEY is not set. Credentials cannot be stored or read. ' +
        'Run `npm run db:setup` to generate one, or set it in your hosting provider.',
    );
    this.name = 'EncryptionKeyMissingError';
  }
}

export class DecryptionFailedError extends Error {
  constructor() {
    // Deliberately vague: never reveal which part of the payload failed.
    super('Stored credential could not be decrypted. The encryption key may have changed.');
    this.name = 'DecryptionFailedError';
  }
}

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

function loadKey(): Buffer {
  const raw = env().ENCRYPTION_KEY;
  if (!raw) throw new EncryptionKeyMissingError();
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(
      'ENCRYPTION_KEY must decode to exactly 32 bytes. Generate one with: ' +
        'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  return key;
}

/** Environment-key cipher. The only implementation shipped in v1. */
export class EnvelopeCipher implements Cipher {
  readonly keyVersion = 1;
  readonly algorithm = ALGORITHM;

  seal(plaintext: string): SealedSecret {
    const key = loadKey();
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      algorithm: ALGORITHM,
      keyVersion: this.keyVersion,
    };
  }

  open(sealed: SealedSecret): string {
    const key = loadKey();
    try {
      const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(sealed.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(sealed.authTag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(sealed.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new DecryptionFailedError();
    }
  }
}

let cipherInstance: Cipher | null = null;

export function getCipher(): Cipher {
  if (!cipherInstance) cipherInstance = new EnvelopeCipher();
  return cipherInstance;
}

/** Test seam for injecting a fake cipher. */
export function setCipher(cipher: Cipher | null): void {
  cipherInstance = cipher;
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

/**
 * A short, non-reversible identifier for a secret. Lets an operator confirm
 * "this is the token I pasted" without the value ever being retrievable.
 */
export function fingerprintSecret(plaintext: string): string {
  return sha256(plaintext).slice(0, 12);
}

/** Display hint such as `••••••••7f2a`. Only the last four characters survive. */
export function maskSecret(plaintext: string): string {
  const trimmed = plaintext.trim();
  if (trimmed.length <= 4) return '••••';
  return `••••••••${trimmed.slice(-4)}`;
}

const SECRET_KEY_PATTERN =
  /(access[_-]?token|client[_-]?secret|client[_-]?id|x-auth-token|authorization|password|api[_-]?key|secret|token|credential|cookie|set-cookie)/i;

const SECRET_VALUE_PATTERNS: RegExp[] = [
  // BigCommerce API account tokens and similar long opaque strings.
  /\b[a-z0-9]{28,}\b/gi,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
];

export const REDACTED = '[redacted]';

/**
 * Recursively removes secrets from any value before it reaches a log line, an
 * audit record or an error message shown to a user.
 */
export function redact<T>(value: T, depth = 0): T {
  if (depth > 8) return REDACTED as unknown as T;

  if (typeof value === 'string') {
    return redactString(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redact(entry, depth + 1)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    if (value instanceof Date) return value;
    if (value instanceof Error) {
      return { name: value.name, message: redactString(value.message) } as unknown as T;
    }
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : redact(entry, depth + 1);
    }
    return result as unknown as T;
  }
  return value;
}

export function redactString(input: string): string {
  let output = input;

  // Value-shaped patterns run first. Otherwise the key=value rule below would
  // consume only the `Bearer` keyword in `Authorization: Bearer <jwt>` and
  // leave the token itself in the clear.
  for (const pattern of SECRET_VALUE_PATTERNS) {
    output = output.replace(pattern, REDACTED);
  }

  // `key=value` and `"key": "value"` forms.
  output = output.replace(
    /((?:access[_-]?token|client[_-]?secret|client[_-]?id|x-auth-token|authorization|password|api[_-]?key|secret|token)"?\s*[:=]\s*"?)([^\s",;}]+)/gi,
    (_match, prefix: string) => `${prefix}${REDACTED}`,
  );

  return output;
}

/** Redacts headers before they are logged. Never mutates the input. */
export function redactHeaders(headers: Record<string, string> | Headers): Record<string, string> {
  const entries =
    headers instanceof Headers ? [...headers.entries()] : Object.entries(headers ?? {});
  return Object.fromEntries(
    entries.map(([key, value]) => [key, SECRET_KEY_PATTERN.test(key) ? REDACTED : value]),
  );
}

/** Removes query-string values that could carry a secret from a logged URL. */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (SECRET_KEY_PATTERN.test(key)) parsed.searchParams.set(key, REDACTED);
    }
    return parsed.toString();
  } catch {
    return redactString(url);
  }
}
