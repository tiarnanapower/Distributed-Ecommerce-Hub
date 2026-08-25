/**
 * Decimal-safe money.
 *
 * Every amount is held as a bigint count of minor units plus an ISO-4217
 * currency code. No IEEE-754 float ever touches a monetary value.
 *
 * The cross-currency rule is enforced by the type system's runtime companion:
 * `add`, `subtract` and `sum` throw on a currency mismatch. Reporting-currency
 * totals must go through `convert`, which requires an explicit rate carrying a
 * source — there is no implicit conversion anywhere in the codebase.
 */

export type CurrencyCode = string;

export interface Money {
  readonly minor: bigint;
  readonly currency: CurrencyCode;
  readonly exponent: number;
}

export class CurrencyMismatchError extends Error {
  constructor(
    readonly left: CurrencyCode,
    readonly right: CurrencyCode,
  ) {
    super(
      `Refusing to combine ${left} with ${right}. Amounts in different currencies must be ` +
        'converted explicitly with a dated exchange rate before they are aggregated.',
    );
    this.name = 'CurrencyMismatchError';
  }
}

export class InvalidAmountError extends Error {
  constructor(value: string) {
    super(`"${value}" is not a valid decimal amount.`);
    this.name = 'InvalidAmountError';
  }
}

/**
 * Currencies whose minor unit is not 1/100. Anything not listed uses 2.
 * Zero-decimal and three-decimal currencies matter for a global estate.
 */
const EXPONENT_OVERRIDES: Record<string, number> = {
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  ISK: 0,
  HUF: 0,
  TWD: 0,
  BHD: 3,
  KWD: 3,
  OMR: 3,
  JOD: 3,
  TND: 3,
};

export function currencyExponent(currency: CurrencyCode): number {
  return EXPONENT_OVERRIDES[currency.toUpperCase()] ?? 2;
}

const AMOUNT_PATTERN = /^-?\d+(\.\d+)?$/;

/** Parses an exact decimal string such as "1234.56" into Money. */
export function money(amount: string | number | bigint, currency: CurrencyCode): Money {
  const code = currency.toUpperCase();
  const exponent = currencyExponent(code);

  if (typeof amount === 'bigint') {
    return { minor: amount, currency: code, exponent };
  }

  const raw = typeof amount === 'number' ? amount.toFixed(exponent) : amount.trim();
  if (!AMOUNT_PATTERN.test(raw)) {
    throw new InvalidAmountError(String(amount));
  }

  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [wholePart, fractionPart = ''] = unsigned.split('.');

  // Round half-up on the first discarded digit rather than truncating, so that
  // a rate conversion producing "10.005" becomes 10.01 and not 10.00.
  const kept = fractionPart.slice(0, exponent).padEnd(exponent, '0');
  const nextDigit = fractionPart.charAt(exponent);
  let minor = BigInt(`${wholePart}${kept}` || '0');
  if (nextDigit !== '' && Number(nextDigit) >= 5) {
    minor += 1n;
  }

  return { minor: negative ? -minor : minor, currency: code, exponent };
}

export function zero(currency: CurrencyCode): Money {
  return { minor: 0n, currency: currency.toUpperCase(), exponent: currencyExponent(currency) };
}

export function fromMinor(minor: bigint | number, currency: CurrencyCode): Money {
  return money(BigInt(minor), currency);
}

/** Renders the exact decimal string, e.g. "1234.56". Never locale-formatted. */
export function toDecimalString(value: Money): string {
  const negative = value.minor < 0n;
  const abs = negative ? -value.minor : value.minor;
  if (value.exponent === 0) {
    return `${negative ? '-' : ''}${abs.toString()}`;
  }
  const digits = abs.toString().padStart(value.exponent + 1, '0');
  const whole = digits.slice(0, digits.length - value.exponent);
  const fraction = digits.slice(digits.length - value.exponent);
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new CurrencyMismatchError(a.currency, b.currency);
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { ...a, minor: a.minor + b.minor };
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { ...a, minor: a.minor - b.minor };
}

export function multiply(value: Money, factor: number | bigint): Money {
  if (typeof factor === 'bigint') {
    return { ...value, minor: value.minor * factor };
  }
  if (!Number.isFinite(factor)) {
    throw new InvalidAmountError(String(factor));
  }
  // Scale the factor to 9 decimal places of precision, then divide back down
  // with half-up rounding — keeps everything in integer arithmetic.
  const SCALE = 1_000_000_000n;
  const scaledFactor = BigInt(Math.round(factor * 1_000_000_000));
  const product = value.minor * scaledFactor;
  return { ...value, minor: divideRoundHalfUp(product, SCALE) };
}

function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const absNum = numerator < 0n ? -numerator : numerator;
  const absDen = denominator < 0n ? -denominator : denominator;
  const quotient = absNum / absDen;
  const remainder = absNum % absDen;
  const rounded = remainder * 2n >= absDen ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

export function compare(a: Money, b: Money): number {
  assertSameCurrency(a, b);
  if (a.minor === b.minor) return 0;
  return a.minor < b.minor ? -1 : 1;
}

export function isZero(value: Money): boolean {
  return value.minor === 0n;
}

export function negate(value: Money): Money {
  return { ...value, minor: -value.minor };
}

export function abs(value: Money): Money {
  return value.minor < 0n ? negate(value) : value;
}

/**
 * Sums amounts that are already known to share a currency. Throws otherwise —
 * this is the guard that stops mixed-currency revenue totals from appearing.
 */
export function sum(values: readonly Money[], currency?: CurrencyCode): Money {
  if (values.length === 0) {
    return zero(currency ?? 'USD');
  }
  const first = values[0]!;
  const target = currency?.toUpperCase() ?? first.currency;
  return values.reduce<Money>((acc, value) => add(acc, value), zero(target));
}

// ---------------------------------------------------------------------------
// Multi-currency aggregation
// ---------------------------------------------------------------------------

/** A total that keeps each currency separate. This is the default everywhere. */
export interface MultiCurrencyTotal {
  readonly byCurrency: ReadonlyMap<CurrencyCode, Money>;
  readonly currencies: readonly CurrencyCode[];
  readonly isMixed: boolean;
}

export function aggregateByCurrency(values: readonly Money[]): MultiCurrencyTotal {
  const byCurrency = new Map<CurrencyCode, Money>();
  for (const value of values) {
    const existing = byCurrency.get(value.currency);
    byCurrency.set(value.currency, existing ? add(existing, value) : value);
  }
  const currencies = [...byCurrency.keys()].sort();
  return { byCurrency, currencies, isMixed: currencies.length > 1 };
}

/**
 * An exchange rate that knows where it came from. Conversions are impossible
 * without one, which is what stops the platform from inventing rates.
 */
export interface ExchangeRate {
  readonly from: CurrencyCode;
  readonly to: CurrencyCode;
  readonly rate: number;
  /** Where the rate came from. `DEMO` values are always labelled in the UI. */
  readonly source: 'DEMO' | 'MANUAL' | 'PROVIDER';
  readonly asOf: Date;
  readonly providerName?: string;
}

export class MissingExchangeRateError extends Error {
  constructor(
    readonly from: CurrencyCode,
    readonly to: CurrencyCode,
  ) {
    super(
      `No exchange rate is configured for ${from} → ${to}. Reporting-currency totals are ` +
        'unavailable until a rate source is configured.',
    );
    this.name = 'MissingExchangeRateError';
  }
}

export function convert(value: Money, rate: ExchangeRate): Money {
  if (value.currency !== rate.from.toUpperCase()) {
    throw new CurrencyMismatchError(value.currency, rate.from);
  }
  const target = rate.to.toUpperCase();
  const targetExponent = currencyExponent(target);
  const SCALE = 1_000_000_000n;
  const scaledRate = BigInt(Math.round(rate.rate * 1_000_000_000));

  // Re-scale between differing minor-unit exponents (e.g. USD 2dp → JPY 0dp).
  let minor = value.minor * scaledRate;
  const exponentDelta = targetExponent - value.exponent;
  if (exponentDelta > 0) {
    minor *= 10n ** BigInt(exponentDelta);
  } else if (exponentDelta < 0) {
    minor = divideRoundHalfUp(minor, 10n ** BigInt(-exponentDelta));
  }
  return { minor: divideRoundHalfUp(minor, SCALE), currency: target, exponent: targetExponent };
}

export interface ConversionResult {
  readonly total: Money;
  readonly converted: readonly { readonly from: CurrencyCode; readonly rate: ExchangeRate }[];
  readonly missing: readonly CurrencyCode[];
  /** True when any contributing rate was generated rather than sourced. */
  readonly containsDemoRates: boolean;
}

/**
 * Converts a multi-currency total into one reporting currency. Currencies
 * without a rate are reported in `missing` rather than silently dropped or
 * added at 1:1.
 */
export function toReportingCurrency(
  total: MultiCurrencyTotal,
  reportingCurrency: CurrencyCode,
  rates: readonly ExchangeRate[],
): ConversionResult {
  const target = reportingCurrency.toUpperCase();
  const rateIndex = new Map(rates.map((rate) => [`${rate.from.toUpperCase()}→${rate.to.toUpperCase()}`, rate]));

  let running = zero(target);
  const converted: { from: CurrencyCode; rate: ExchangeRate }[] = [];
  const missing: CurrencyCode[] = [];
  let containsDemoRates = false;

  for (const [currency, amount] of total.byCurrency) {
    if (currency === target) {
      running = add(running, amount);
      continue;
    }
    const rate = rateIndex.get(`${currency}→${target}`);
    if (!rate) {
      missing.push(currency);
      continue;
    }
    running = add(running, convert(amount, rate));
    converted.push({ from: currency, rate });
    if (rate.source === 'DEMO') containsDemoRates = true;
  }

  return { total: running, converted, missing, containsDemoRates };
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

export function formatMoney(
  value: Money,
  options: { locale?: string; compact?: boolean; showCode?: boolean } = {},
): string {
  const { locale = 'en-US', compact = false, showCode = false } = options;
  const numeric = Number(toDecimalString(value));
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: value.currency,
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: compact ? 1 : value.exponent,
      minimumFractionDigits: compact ? 0 : value.exponent,
      currencyDisplay: showCode ? 'code' : 'symbol',
    }).format(numeric);
  } catch {
    // Unknown currency code — fall back to a plain, unambiguous rendering.
    return `${toDecimalString(value)} ${value.currency}`;
  }
}

export function formatMoneyString(
  amount: string,
  currency: CurrencyCode,
  options?: { locale?: string; compact?: boolean; showCode?: boolean },
): string {
  return formatMoney(money(amount, currency), options);
}

/** Percentage of `part` within `whole`, guarded against divide-by-zero. */
export function percentOf(part: Money, whole: Money): number | null {
  assertSameCurrency(part, whole);
  if (whole.minor === 0n) return null;
  return Number((part.minor * 10_000n) / whole.minor) / 100;
}

/** Mean of a set of same-currency amounts, e.g. average order value. */
export function average(values: readonly Money[]): Money | null {
  if (values.length === 0) return null;
  const total = sum(values);
  return { ...total, minor: divideRoundHalfUp(total.minor, BigInt(values.length)) };
}

export function divideBy(value: Money, divisor: number): Money {
  if (divisor === 0) throw new InvalidAmountError('division by zero');
  return { ...value, minor: divideRoundHalfUp(value.minor * 1_000_000n, BigInt(Math.round(divisor * 1_000_000))) };
}
