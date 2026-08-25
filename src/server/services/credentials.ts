/**
 * Credential lifecycle.
 *
 * Plaintext secrets exist in exactly two places: the request body that stores
 * them, and the in-memory value handed to the BigCommerce client. They are
 * never returned to a browser, never logged, and never copied between stores.
 */
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { parseJson } from '@/lib/json';
import { z } from 'zod';
import {
  fingerprintSecret,
  getCipher,
  maskSecret,
  type SealedSecret,
} from '@/lib/crypto/credentials';
import type { CredentialStatus, CredentialType } from '@/lib/enums';

const scopeArraySchema = z.array(z.string());

/** What a browser is allowed to see about a stored credential. */
export interface RedactedCredential {
  id: string;
  credentialType: CredentialType;
  label: string;
  maskedHint: string;
  fingerprint: string;
  status: CredentialStatus;
  scopes: string[];
  lastValidatedAt: Date | null;
  lastValidationError: string | null;
  rotatedAt: Date | null;
  createdAt: Date;
}

export function redactCredential(record: {
  id: string;
  credentialType: string;
  label: string;
  maskedHint: string;
  fingerprint: string;
  status: string;
  scopesJson: string;
  lastValidatedAt: Date | null;
  lastValidationError: string | null;
  rotatedAt: Date | null;
  createdAt: Date;
}): RedactedCredential {
  return {
    id: record.id,
    credentialType: record.credentialType as CredentialType,
    label: record.label,
    maskedHint: record.maskedHint,
    fingerprint: record.fingerprint,
    status: record.status as CredentialStatus,
    scopes: parseJson(record.scopesJson, scopeArraySchema, []),
    lastValidatedAt: record.lastValidatedAt,
    lastValidationError: record.lastValidationError,
    rotatedAt: record.rotatedAt,
    createdAt: record.createdAt,
  };
}

export interface StoreCredentialInput {
  organisationId: string;
  connectionId: string;
  credentialType: CredentialType;
  label: string;
  plaintext: string;
  scopes?: string[];
  createdByUserId?: string | null;
}

/**
 * Saves a secret. Any previously active credential of the same type is marked
 * `ROTATED` first, giving a clean audit trail and satisfying the unique
 * constraint on (connection, type, status).
 */
export async function storeCredential(input: StoreCredentialInput): Promise<RedactedCredential> {
  const trimmed = input.plaintext.trim();
  if (!trimmed) {
    throw new AppError('VALIDATION_FAILED', 'The credential value cannot be empty.');
  }

  const sealed: SealedSecret = getCipher().seal(trimmed);

  const record = await prisma.$transaction(async (tx) => {
    await tx.credentialRecord.updateMany({
      where: {
        connectionId: input.connectionId,
        credentialType: input.credentialType,
        status: 'ACTIVE',
      },
      data: { status: 'ROTATED', rotatedAt: new Date() },
    });

    // Drop any stale non-active row that would collide on the unique key.
    await tx.credentialRecord.deleteMany({
      where: {
        connectionId: input.connectionId,
        credentialType: input.credentialType,
        status: { in: ['UNVERIFIED', 'INVALID'] },
      },
    });

    return tx.credentialRecord.create({
      data: {
        organisationId: input.organisationId,
        connectionId: input.connectionId,
        credentialType: input.credentialType,
        label: input.label,
        ciphertext: sealed.ciphertext,
        iv: sealed.iv,
        authTag: sealed.authTag,
        algorithm: sealed.algorithm,
        keyVersion: sealed.keyVersion,
        maskedHint: maskSecret(trimmed),
        fingerprint: fingerprintSecret(trimmed),
        scopesJson: JSON.stringify(input.scopes ?? []),
        status: 'ACTIVE',
        createdByUserId: input.createdByUserId ?? null,
      },
    });
  });

  return redactCredential(record);
}

/** Server-side only. Returns the decrypted secret for an outbound API call. */
export async function revealCredential(
  connectionId: string,
  credentialType: CredentialType,
): Promise<string | null> {
  const record = await prisma.credentialRecord.findFirst({
    where: { connectionId, credentialType, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) return null;
  return getCipher().open({
    ciphertext: record.ciphertext,
    iv: record.iv,
    authTag: record.authTag,
    algorithm: record.algorithm,
    keyVersion: record.keyVersion,
  });
}

export async function listCredentials(connectionId: string): Promise<RedactedCredential[]> {
  const records = await prisma.credentialRecord.findMany({
    where: { connectionId },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });
  return records.map(redactCredential);
}

export async function markCredentialValidated(
  connectionId: string,
  result: { ok: boolean; scopes?: string[]; error?: string },
): Promise<void> {
  await prisma.credentialRecord.updateMany({
    where: { connectionId, status: { in: ['ACTIVE', 'UNVERIFIED', 'INVALID'] } },
    data: {
      status: result.ok ? 'ACTIVE' : 'INVALID',
      lastValidatedAt: new Date(),
      lastValidationError: result.ok ? null : (result.error ?? 'Validation failed').slice(0, 400),
      // Only overwrite when we genuinely learned something. An empty list
      // means the scopes could not be determined, and clobbering a previously
      // recorded set with it would lose real information.
      ...(result.scopes && result.scopes.length > 0
        ? { scopesJson: JSON.stringify(result.scopes) }
        : {}),
    },
  });
}

export async function revokeCredentials(connectionId: string): Promise<number> {
  const result = await prisma.credentialRecord.updateMany({
    where: { connectionId, status: { in: ['ACTIVE', 'UNVERIFIED'] } },
    data: { status: 'REVOKED', rotatedAt: new Date() },
  });
  return result.count;
}

/** True when the store has an active API token stored. */
export async function hasActiveCredentials(connectionId: string): Promise<boolean> {
  const count = await prisma.credentialRecord.count({
    where: { connectionId, credentialType: 'API_ACCOUNT_TOKEN', status: 'ACTIVE' },
  });
  return count > 0;
}
