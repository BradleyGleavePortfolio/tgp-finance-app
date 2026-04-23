import { formatCurrency, formatPercent, formatMonths } from './formatters';

describe('formatCurrency', () => {
  it('formats whole-dollar amounts with commas', () => {
    expect(formatCurrency(12345.67)).toBe('$12,345.67');
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('renders negatives with a leading minus', () => {
    expect(formatCurrency(-250)).toBe('-$250.00');
  });

  it('compact form abbreviates thousands and millions', () => {
    expect(formatCurrency(1500, { compact: true })).toBe('$1.5K');
    expect(formatCurrency(2_400_000, { compact: true })).toBe('$2.4M');
  });

  it('showSign prefixes positives with "+"', () => {
    expect(formatCurrency(100, { showSign: true })).toBe('+$100.00');
  });
});

describe('formatPercent', () => {
  it('treats raw values as already percent by default', () => {
    expect(formatPercent(15.67)).toBe('15.7%');
  });

  it('with asDecimal=true multiplies by 100', () => {
    expect(formatPercent(0.1567, 2, true)).toBe('15.67%');
  });
});

describe('formatMonths', () => {
  it('collapses 0 or negative months to "Now"', () => {
    expect(formatMonths(0)).toBe('Now');
    expect(formatMonths(-3)).toBe('Now');
  });

  it('formats years+months', () => {
    expect(formatMonths(18)).toBe('1 yr 6 mo');
    expect(formatMonths(24)).toBe('2 yr');
    expect(formatMonths(5)).toBe('5 mo');
  });
});
