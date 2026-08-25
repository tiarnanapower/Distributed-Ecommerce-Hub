/**
 * Central product configuration.
 *
 * The product name and all branding strings live here so they can be changed
 * in one place. Runtime environment parsing also lives here so that no other
 * module reads `process.env` directly.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Branding
// ---------------------------------------------------------------------------

export const product = {
  name: 'Commerce Command Center',
  shortName: 'Command Center',
  initials: 'CC',
  tagline: 'Centralised operations for global BigCommerce estates',
  description:
    'Connect, organise, monitor and govern every BigCommerce store and storefront in your organisation from a single control plane.',
  vendor: 'Acme Global Commerce',
  supportUrl: 'https://support.bigcommerce.com',
  docsUrl: 'https://developer.bigcommerce.com/docs',
  version: '0.1.0',
} as const;

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const booleanish = z
  .string()
  .optional()
  .transform((value) => value === 'true' || value === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1).default('file:./dev.db'),
  APP_BASE_URL: z.string().default('http://localhost:3000'),

  ENCRYPTION_KEY: z.string().default(''),
  SESSION_SECRET: z.string().default(''),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),

  COMMERCE_MODE: z.enum(['demo', 'connected', 'hybrid']).default('hybrid'),
  DISABLE_OUTBOUND_API: booleanish,

  BIGCOMMERCE_API_HOST: z.string().default('https://api.bigcommerce.com'),
  BIGCOMMERCE_LOGIN_HOST: z.string().default('https://login.bigcommerce.com'),
  BIGCOMMERCE_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  BIGCOMMERCE_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  BIGCOMMERCE_STORE_HASH: z.string().optional(),
  BIGCOMMERCE_ACCESS_TOKEN: z.string().optional(),

  JOB_RUNNER_ENABLED: z
    .string()
    .optional()
    .transform((value) => value !== 'false'),
  JOB_RUNNER_POLL_MS: z.coerce.number().int().positive().default(2_000),
  JOB_RUNNER_BATCH_SIZE: z.coerce.number().int().positive().default(25),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | null = null;

export function env(): AppEnv {
  if (!cachedEnv) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      // Never echo values — only the offending keys.
      const keys = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
      throw new Error(
        `Invalid environment configuration. Check these variables in .env: ${keys}. ` +
          'Run `npm run db:setup` to regenerate a valid local .env.',
      );
    }
    cachedEnv = parsed.data;
  }
  return cachedEnv;
}

/** Test seam — clears the memoised environment. */
export function resetEnvCache(): void {
  cachedEnv = null;
}

// ---------------------------------------------------------------------------
// Derived runtime facts
// ---------------------------------------------------------------------------

export const runtime = {
  isProduction: () => env().NODE_ENV === 'production',
  isDevelopment: () => env().NODE_ENV === 'development',
  usingSqlite: () => env().DATABASE_URL.startsWith('file:'),
  usingLocalAuth: () => true, // v1 ships only the local auth adapter.
  outboundApiDisabled: () => env().DISABLE_OUTBOUND_API === true,
  commerceMode: () => env().COMMERCE_MODE,
};

/**
 * Development banner content. Shown in the app shell whenever the deployment
 * is using local-only primitives that must not reach production.
 */
export function developmentWarnings(): string[] {
  const warnings: string[] = [];
  if (runtime.usingLocalAuth()) {
    warnings.push(
      'Local authentication is active. There is no identity provider, MFA or password policy — replace it before any shared deployment.',
    );
  }
  if (runtime.usingSqlite()) {
    warnings.push(
      'SQLite is the active datastore. It is single-writer and file-based; move to PostgreSQL for shared or production use.',
    );
  }
  if (runtime.outboundApiDisabled()) {
    warnings.push('Outbound BigCommerce API calls are disabled by DISABLE_OUTBOUND_API.');
  }
  return warnings;
}
