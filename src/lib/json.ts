/**
 * Typed access to the JSON-text columns used by the SQLite schema.
 *
 * Every read goes through a Zod schema so malformed or legacy rows degrade to a
 * documented fallback instead of throwing deep inside a page render.
 */
import type { z } from 'zod';

export function parseJson<S extends z.ZodTypeAny>(
  raw: string | null | undefined,
  schema: S,
  fallback: z.infer<S>,
): z.infer<S> {
  if (!raw) return fallback;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

/** Loose read for display-only payloads where a schema would be overkill. */
export function parseJsonLoose<T = unknown>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function stringifyJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

/**
 * Stable stringify — object keys are sorted so that two structurally equal
 * payloads always hash identically. Used for checksums and drift detection.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries.map(([key, val]) => [key, sortValue(val)]));
  }
  if (value instanceof Date) return value.toISOString();
  return value;
}
