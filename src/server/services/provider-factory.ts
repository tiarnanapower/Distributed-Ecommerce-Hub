/**
 * Chooses the provider for a store.
 *
 * The rule is explicit and never fudged:
 *  * a connection marked `isDemo` always gets the demo provider;
 *  * a real connection needs an active API token, otherwise the caller is told
 *    so rather than being silently handed demo data;
 *  * `COMMERCE_MODE=demo` forces demo for everything, which is the safe setting
 *    for presentations;
 *  * `DISABLE_OUTBOUND_API` makes the BigCommerce provider refuse every call.
 *
 * Demo and connected data are never blended: `ProviderHandle.source` travels
 * with the result so every screen can label where its numbers came from.
 */
import { env } from '@/lib/config';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { parseJson } from '@/lib/json';
import { z } from 'zod';
import { BigCommerceProvider } from '@/lib/commerce/bigcommerce/provider';
import { DemoCommerceProvider } from '@/lib/commerce/demo/provider';
import type { CommerceProvider } from '@/lib/commerce/types';
import { revealCredential } from './credentials';

export type DataSource = 'DEMO' | 'LIVE';

export interface ProviderHandle {
  provider: CommerceProvider;
  source: DataSource;
  /** Why this source was chosen — surfaced in the UI's data-source badge. */
  reason: string;
  connectionId: string;
  connectionName: string;
}

const scopeSchema = z.array(z.string());

export async function getProviderFor(connectionId: string): Promise<ProviderHandle> {
  const connection = await prisma.storeConnection.findUnique({
    where: { id: connectionId },
    select: { id: true, name: true, isDemo: true, storeHash: true, status: true },
  });

  if (!connection) {
    throw new AppError('NOT_FOUND', 'That store could not be found.');
  }

  const demoHandle = (reason: string): ProviderHandle => ({
    provider: new DemoCommerceProvider(connection.id),
    source: 'DEMO',
    reason,
    connectionId: connection.id,
    connectionName: connection.name,
  });

  if (env().COMMERCE_MODE === 'demo') {
    return demoHandle('COMMERCE_MODE is set to "demo", so no store is contacted.');
  }

  if (connection.isDemo) {
    return demoHandle('This store is a demo connection. Its data is seeded, not live.');
  }

  if (!connection.storeHash) {
    throw new AppError(
      'CREDENTIAL_MISSING',
      'This store has no BigCommerce store hash yet.',
      { hint: 'Finish the connection wizard, or complete provisioning first.' },
    );
  }

  const accessToken = await revealCredential(connection.id, 'API_ACCOUNT_TOKEN');
  if (!accessToken) {
    throw new AppError(
      'CREDENTIAL_MISSING',
      'This store has no active API token, so live data cannot be read.',
      { hint: 'Add an API account token on the store’s Credentials tab.' },
    );
  }

  const credential = await prisma.credentialRecord.findFirst({
    where: { connectionId: connection.id, credentialType: 'API_ACCOUNT_TOKEN', status: 'ACTIVE' },
    select: { scopesJson: true },
  });

  return {
    provider: new BigCommerceProvider({
      connectionId: connection.id,
      credentials: { storeHash: connection.storeHash, accessToken },
      knownScopes: credential ? parseJson(credential.scopesJson, scopeSchema, []) : null,
    }),
    source: 'LIVE',
    reason: 'Live BigCommerce data, read with the stored API account token.',
    connectionId: connection.id,
    connectionName: connection.name,
  };
}

/**
 * Same as `getProviderFor`, but returns a describable failure instead of
 * throwing. Pages use this so one broken store cannot blank a dashboard.
 */
export async function tryGetProviderFor(
  connectionId: string,
): Promise<{ ok: true; handle: ProviderHandle } | { ok: false; error: AppError }> {
  try {
    return { ok: true, handle: await getProviderFor(connectionId) };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof AppError
          ? error
          : new AppError('INTERNAL', 'The store provider could not be created.'),
    };
  }
}

/** Human-readable summary of the platform's operating mode, for the UI banner. */
export function describeCommerceMode(): { mode: string; label: string; detail: string } {
  const mode = env().COMMERCE_MODE;
  if (env().DISABLE_OUTBOUND_API) {
    return {
      mode: 'disabled',
      label: 'Outbound API disabled',
      detail: 'Every BigCommerce request is blocked. Only seeded demo data is available.',
    };
  }
  switch (mode) {
    case 'demo':
      return {
        mode,
        label: 'Demo mode',
        detail: 'All data is seeded. No BigCommerce store is contacted, and nothing can be written.',
      };
    case 'connected':
      return {
        mode,
        label: 'Connected mode',
        detail: 'Stores with stored credentials are read live from the BigCommerce API.',
      };
    default:
      return {
        mode,
        label: 'Hybrid mode',
        detail:
          'Demo connections use seeded data; real connections are read live. Every screen labels which it is showing.',
      };
  }
}
