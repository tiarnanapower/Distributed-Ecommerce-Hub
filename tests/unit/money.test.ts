import { describe, expect, it } from 'vitest';

import {
  CurrencyMismatchError,
  InvalidAmountError,
  MissingExchangeRateError,
  aggregateByCurrency,
  add,
  average,
  compare,
  convert,
  currencyExponent,
  formatMoney,
  money,
  multiply,
  percentOf,
  subtract,
  sum,
  toDecimalString,
  toReportingCurrency,
  zero,
  type ExchangeRate,
} from '@/lib/money';

const rate = (from: string, to: string, value: number, source: ExchangeRate['source'] = 'PROVIDER'): ExchangeRate => ({
  from,
  to,
  rate: value,
  source,
  asOf: new Date('2026-01-01'),
});

describe('money parsing and rendering', () => {
  it('parses an exact decimal without float error', () => {
    expect(toDecimalString(money('0.1', 'USD'))).toBe('0.10');
    expect(toDecimalString(money('1234.56', 'USD'))).toBe('1234.56');
    expect(toDecimalString(money('-45.99', 'GBP'))).toBe('-45.99');
  });

  it('avoids the classic 0.1 + 0.2 float problem', () => {
    const total = add(money('0.1', 'USD'), money('0.2', 'USD'));
    expect(toDecimalString(total)).toBe('0.30');
    // The float equivalent would be 0.30000000000000004.
    expect(Number(toDecimalString(total))).toBe(0.3);
  });

  it('handles zero-decimal currencies', () => {
    expect(currencyExponent('JPY')).toBe(0);
    expect(toDecimalString(money('19800', 'JPY'))).toBe('19800');
    expect(toDecimalString(add(money('100', 'JPY'), money('250', 'JPY')))).toBe('350');
  });

  it('handles three-decimal currencies', () => {
    expect(currencyExponent('KWD')).toBe(3);
    expect(toDecimalString(money('12.345', 'KWD'))).toBe('12.345');
  });

  it('rounds half-up on the first discarded digit rather than truncating', () => {
    expect(toDecimalString(money('10.005', 'USD'))).toBe('10.01');
    expect(toDecimalString(money('10.004', 'USD'))).toBe('10.00');
  });

  it('rejects values that are not decimals', () => {
    expect(() => money('twelve', 'USD')).toThrow(InvalidAmountError);
    expect(() => money('1,200.00', 'USD')).toThrow(InvalidAmountError);
    expect(() => money('', 'USD')).toThrow(InvalidAmountError);
  });

  it('formats without losing the currency', () => {
    expect(formatMoney(money('1234.56', 'GBP'), { locale: 'en-GB' })).toContain('1,234.56');
    // An unrecognised code must still render the amount and the code rather
    // than throwing. Intl accepts any well-formed 3-letter code, so the output
    // shape varies by runtime — what matters is that both parts survive.
    const exotic = formatMoney(money('10.00', 'XYZ'));
    expect(exotic).toContain('10.00');
    expect(exotic).toContain('XYZ');
  });
});

describe('cross-currency safeguards', () => {
  it('refuses to add different currencies', () => {
    expect(() => add(money('10.00', 'USD'), money('10.00', 'GBP'))).toThrow(CurrencyMismatchError);
    expect(() => subtract(money('10.00', 'EUR'), money('1.00', 'USD'))).toThrow(CurrencyMismatchError);
    expect(() => compare(money('1.00', 'USD'), money('1.00', 'JPY'))).toThrow(CurrencyMismatchError);
  });

  it('names both currencies in the error, so the message is actionable', () => {
    try {
      add(money('1.00', 'USD'), money('1.00', 'GBP'));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CurrencyMismatchError);
      expect((error as Error).message).toContain('USD');
      expect((error as Error).message).toContain('GBP');
    }
  });

  it('keeps currencies separate when aggregating', () => {
    const total = aggregateByCurrency([
      money('100.00', 'USD'),
      money('50.00', 'GBP'),
      money('25.00', 'USD'),
    ]);
    expect(total.isMixed).toBe(true);
    expect(total.currencies).toEqual(['GBP', 'USD']);
    expect(toDecimalString(total.byCurrency.get('USD')!)).toBe('125.00');
    expect(toDecimalString(total.byCurrency.get('GBP')!)).toBe('50.00');
  });

  it('reports a single-currency aggregate as not mixed', () => {
    const total = aggregateByCurrency([money('1.00', 'EUR'), money('2.00', 'EUR')]);
    expect(total.isMixed).toBe(false);
    expect(toDecimalString(total.byCurrency.get('EUR')!)).toBe('3.00');
  });

  it('sums an empty list to zero in the requested currency', () => {
    expect(toDecimalString(sum([], 'JPY'))).toBe('0');
  });
});

describe('conversion', () => {
  it('converts using an explicit rate', () => {
    const converted = convert(money('100.00', 'GBP'), rate('GBP', 'USD', 1.27));
    expect(converted.currency).toBe('USD');
    expect(toDecimalString(converted)).toBe('127.00');
  });

  it('re-scales between differing minor units', () => {
    // USD (2dp) → JPY (0dp)
    const converted = convert(money('10.00', 'USD'), rate('USD', 'JPY', 156.25));
    expect(converted.currency).toBe('JPY');
    expect(converted.exponent).toBe(0);
    expect(toDecimalString(converted)).toBe('1563');
  });

  it('refuses a rate whose source currency does not match', () => {
    expect(() => convert(money('10.00', 'EUR'), rate('GBP', 'USD', 1.27))).toThrow(CurrencyMismatchError);
  });

  it('excludes currencies with no rate rather than dropping or 1:1-ing them', () => {
    const total = aggregateByCurrency([
      money('100.00', 'USD'),
      money('100.00', 'GBP'),
      money('100.00', 'SEK'),
    ]);
    const result = toReportingCurrency(total, 'USD', [rate('GBP', 'USD', 1.27)]);

    expect(result.missing).toEqual(['SEK']);
    // 100 USD + (100 GBP × 1.27) — the SEK is absent, not silently added.
    expect(toDecimalString(result.total)).toBe('227.00');
    expect(result.converted).toHaveLength(1);
  });

  it('flags when demo rates contributed to a total', () => {
    const total = aggregateByCurrency([money('100.00', 'GBP')]);
    const result = toReportingCurrency(total, 'USD', [rate('GBP', 'USD', 1.27, 'DEMO')]);
    expect(result.containsDemoRates).toBe(true);
  });

  it('does not flag demo rates when every rate came from a provider', () => {
    const total = aggregateByCurrency([money('100.00', 'GBP')]);
    const result = toReportingCurrency(total, 'USD', [rate('GBP', 'USD', 1.27, 'PROVIDER')]);
    expect(result.containsDemoRates).toBe(false);
  });

  it('MissingExchangeRateError carries both currencies', () => {
    const error = new MissingExchangeRateError('SEK', 'USD');
    expect(error.message).toContain('SEK');
    expect(error.message).toContain('USD');
  });
});

describe('arithmetic', () => {
  it('multiplies without float drift', () => {
    expect(toDecimalString(multiply(money('19.99', 'USD'), 3))).toBe('59.97');
    expect(toDecimalString(multiply(money('0.07', 'USD'), 100))).toBe('7.00');
  });

  it('averages exactly', () => {
    const result = average([money('10.00', 'USD'), money('20.00', 'USD'), money('31.00', 'USD')]);
    expect(toDecimalString(result!)).toBe('20.33');
  });

  it('returns null for the average of nothing', () => {
    expect(average([])).toBeNull();
  });

  it('computes a percentage and guards divide-by-zero', () => {
    expect(percentOf(money('25.00', 'USD'), money('100.00', 'USD'))).toBe(25);
    expect(percentOf(money('25.00', 'USD'), zero('USD'))).toBeNull();
  });
});
