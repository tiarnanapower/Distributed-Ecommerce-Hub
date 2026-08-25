/**
 * Deterministic pseudo-random helpers.
 *
 * The seed data must be identical on every machine so that screenshots, tests
 * and documentation stay in step. A fixed-seed mulberry32 generator gives us
 * variety without unpredictability.
 */
export function createRandom(seed = 0x5eed_1234) {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int: (min: number, max: number): number => Math.floor(next() * (max - min + 1)) + min,
    float: (min: number, max: number, decimals = 2): number =>
      Number((next() * (max - min) + min).toFixed(decimals)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!,
    pickMany: <T>(items: readonly T[], count: number): T[] => {
      const pool = [...items];
      const chosen: T[] = [];
      for (let index = 0; index < Math.min(count, pool.length); index += 1) {
        chosen.push(pool.splice(Math.floor(next() * pool.length), 1)[0]!);
      }
      return chosen;
    },
    bool: (probability = 0.5): boolean => next() < probability,
    /** Weighted pick: `[["a", 3], ["b", 1]]` chooses "a" three times as often. */
    weighted: <T>(entries: readonly (readonly [T, number])[]): T => {
      const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
      let roll = next() * total;
      for (const [value, weight] of entries) {
        roll -= weight;
        if (roll <= 0) return value;
      }
      return entries[entries.length - 1]![0];
    },
  };
}

export type Random = ReturnType<typeof createRandom>;

/** A date `daysAgo` days before `reference`, at a plausible trading hour. */
export function daysBefore(reference: Date, daysAgo: number, random?: Random): Date {
  const date = new Date(reference);
  date.setDate(date.getDate() - daysAgo);
  if (random) {
    date.setHours(random.int(6, 22), random.int(0, 59), random.int(0, 59), 0);
  } else {
    date.setHours(12, 0, 0, 0);
  }
  return date;
}

export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Exact decimal string for a money amount, honouring zero-decimal currencies. */
export function decimal(value: number, exponent = 2): string {
  return value.toFixed(exponent);
}
