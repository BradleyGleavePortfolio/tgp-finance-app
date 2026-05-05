import { Prisma } from '@prisma/client';
import {
  MoneyAmount,
  MoneyAmountAny,
  MoneyAmountNonNegative,
  MoneyAmountPositive,
} from '../src/common/zod/money';

describe('MoneyAmount Zod schema', () => {
  // ── Acceptance: well-formed strings + numbers coerce to Prisma.Decimal ────

  it.each([
    ['"123.45"', '123.45', '123.45'],
    ['"0"', '0', '0'],
    ['"0.00"', '0.00', '0'],
    ['"42"', '42', '42'],
    ['integer 100', 100, '100'],
    ['float 3.14', 3.14, '3.14'],
    ['12 integer digits', '999999999999.99', '999999999999.99'],
  ])('accepts %s and coerces to Decimal', (_label, input, expected) => {
    const result = MoneyAmountAny().safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeInstanceOf(Prisma.Decimal);
      expect(result.data.toString()).toBe(expected);
    }
  });

  it('trims surrounding whitespace from string input', () => {
    const result = MoneyAmount().safeParse('  12.34  ');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.toFixed(2)).toBe('12.34');
  });

  // ── Rejection: precision, format, special values ─────────────────────────

  it('rejects strings with more than 2 decimal places', () => {
    const result = MoneyAmount().safeParse('1.234');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/2 decimal places/);
    }
  });

  it('rejects strings with more than 12 integer digits', () => {
    const result = MoneyAmount().safeParse('1234567890123.00');
    expect(result.success).toBe(false);
  });

  it('rejects non-numeric strings ("abc")', () => {
    const result = MoneyAmount().safeParse('abc');
    expect(result.success).toBe(false);
  });

  it('rejects empty strings', () => {
    const result = MoneyAmount().safeParse('');
    expect(result.success).toBe(false);
  });

  it('rejects Infinity', () => {
    const result = MoneyAmount().safeParse(Infinity);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/finite/);
    }
  });

  it('rejects -Infinity', () => {
    const result = MoneyAmount().safeParse(-Infinity);
    expect(result.success).toBe(false);
  });

  it('rejects NaN', () => {
    const result = MoneyAmount().safeParse(NaN);
    expect(result.success).toBe(false);
  });

  it('rejects booleans', () => {
    expect(MoneyAmount().safeParse(true as any).success).toBe(false);
    expect(MoneyAmount().safeParse(false as any).success).toBe(false);
  });

  it('rejects objects and arrays', () => {
    expect(MoneyAmount().safeParse({} as any).success).toBe(false);
    expect(MoneyAmount().safeParse([] as any).success).toBe(false);
  });

  it('rejects null and undefined', () => {
    expect(MoneyAmount().safeParse(null as any).success).toBe(false);
    expect(MoneyAmount().safeParse(undefined as any).success).toBe(false);
  });

  // ── Sign / zero gates (configurable) ─────────────────────────────────────

  it('default schema rejects negative values', () => {
    const result = MoneyAmount().safeParse('-1.00');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/not be negative/);
    }
  });

  it('default schema accepts zero', () => {
    expect(MoneyAmount().safeParse('0').success).toBe(true);
    expect(MoneyAmount().safeParse('0.00').success).toBe(true);
    expect(MoneyAmount().safeParse(0).success).toBe(true);
  });

  it('MoneyAmountPositive rejects zero', () => {
    const result = MoneyAmountPositive().safeParse('0');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/not be zero/);
    }
  });

  it('MoneyAmountPositive rejects negative', () => {
    expect(MoneyAmountPositive().safeParse('-1').success).toBe(false);
  });

  it('MoneyAmountPositive accepts a positive value', () => {
    const result = MoneyAmountPositive().safeParse('500.00');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.toFixed(2)).toBe('500.00');
  });

  it('MoneyAmountNonNegative accepts zero and positive, rejects negative', () => {
    expect(MoneyAmountNonNegative().safeParse('0').success).toBe(true);
    expect(MoneyAmountNonNegative().safeParse('100').success).toBe(true);
    expect(MoneyAmountNonNegative().safeParse('-1').success).toBe(false);
  });

  it('MoneyAmountAny accepts negatives and zero', () => {
    const neg = MoneyAmountAny().safeParse('-500.50');
    expect(neg.success).toBe(true);
    if (neg.success) expect(neg.data.toString()).toBe('-500.5');
    expect(MoneyAmountAny().safeParse('0').success).toBe(true);
  });

  it('preserves cent precision exactly (no IEEE-754 drift)', () => {
    // Classic 0.1 + 0.2 trap: as Number this is 0.30000000000000004.
    // As Decimal it must round-trip cleanly.
    const a = MoneyAmount().safeParse('0.10');
    const b = MoneyAmount().safeParse('0.20');
    expect(a.success && b.success).toBe(true);
    if (a.success && b.success) {
      expect(a.data.plus(b.data).toFixed(2)).toBe('0.30');
    }
  });
});
