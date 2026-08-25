import { PrismaClient } from '@prisma/client';

import { env } from '@/lib/config';

/**
 * A single Prisma client per process. Next.js dev-mode module reloading would
 * otherwise open a new connection pool on every edit.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env().LOG_LEVEL === 'debug' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (env().NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export type Db = PrismaClient;

/**
 * Runs a callback inside a transaction. Extracted so the repository layer never
 * depends on Prisma's transaction signature directly — the same call shape
 * works against PostgreSQL.
 */
export function transaction<T>(fn: (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>) {
  return prisma.$transaction(fn, { timeout: 30_000 });
}
