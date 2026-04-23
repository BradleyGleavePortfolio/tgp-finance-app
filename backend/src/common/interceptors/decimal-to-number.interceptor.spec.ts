import { Prisma } from '@prisma/client';
import { convertDecimals } from './decimal-to-number.interceptor';

describe('convertDecimals', () => {
  it('converts a scalar Decimal to a number', () => {
    const result = convertDecimals(new Prisma.Decimal('1234.56'));
    expect(result).toBe(1234.56);
  });

  it('walks into nested objects', () => {
    const input = {
      net_worth: new Prisma.Decimal('10000.00'),
      profile: {
        total_cash: new Prisma.Decimal('500.25'),
        name: 'Jane',
      },
      streak: 5,
    };
    const result = convertDecimals(input) as typeof input;
    expect(result.net_worth).toBe(10000);
    expect(result.profile.total_cash).toBe(500.25);
    expect(result.profile.name).toBe('Jane');
    expect(result.streak).toBe(5);
  });

  it('converts Decimals inside arrays', () => {
    const input = [
      { balance: new Prisma.Decimal('100.00') },
      { balance: new Prisma.Decimal('200.50') },
    ];
    const result = convertDecimals(input) as typeof input;
    expect(result[0].balance).toBe(100);
    expect(result[1].balance).toBe(200.5);
  });

  it('leaves null/undefined/primitives untouched', () => {
    expect(convertDecimals(null)).toBeNull();
    expect(convertDecimals(undefined)).toBeUndefined();
    expect(convertDecimals('string')).toBe('string');
    expect(convertDecimals(42)).toBe(42);
    expect(convertDecimals(true)).toBe(true);
  });

  it('leaves Date instances alone (custom prototype)', () => {
    const d = new Date('2026-04-23T00:00:00Z');
    const result = convertDecimals({ created_at: d }) as { created_at: Date };
    expect(result.created_at).toBe(d);
  });
});
