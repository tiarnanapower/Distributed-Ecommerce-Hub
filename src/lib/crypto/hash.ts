import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { env } from '@/lib/config';

/** SHA-256 hex digest. Used for session token lookup and content checksums. */
export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Short content checksum for cheap drift detection on snapshots. */
export function checksum(value: string): string {
  return sha256(value).slice(0, 32);
}

/**
 * Keyed hash for values that must be comparable but never reversible —
 * customer emails, client IP addresses. Uses SESSION_SECRET as the key so the
 * hashes are useless outside this deployment.
 */
export function keyedHash(value: string, domain: string): string {
  return createHmac('sha256', env().SESSION_SECRET || 'insecure-development-fallback')
    .update(`${domain}:${value.toLowerCase().trim()}`)
    .digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
