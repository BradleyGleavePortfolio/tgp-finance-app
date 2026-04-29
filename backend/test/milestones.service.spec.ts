import { Prisma } from '@prisma/client';
import { MILESTONES } from '../src/milestones/milestones.service';

// The first_debt_paid check signature is (profile, accounts, onboardDebt) but
// only inspects accounts. A zeroed profile is enough — keep the field set
// minimal so a future schema change doesn't ripple through the test.
const ZERO_PROFILE = {
  total_cash: new Prisma.Decimal(0),
  total_debt: new Prisma.Decimal(0),
  net_worth_snapshot: new Prisma.Decimal(0),
  annual_income_gross: new Prisma.Decimal(0),
};

describe('MILESTONES — first_debt_paid Decimal equality', () => {
  // Doctrine §10 item 5. Prisma surfaces money columns as Decimal instances;
  // strict equality against a JS number is always false. The check has to
  // unwrap via toN() (or Decimal#equals) before comparing to zero.
  const def = MILESTONES.find((m) => m.key === 'first_debt_paid');

  it('exists', () => {
    expect(def).toBeDefined();
  });

  it('fires when a debt account balance is Decimal(0)', () => {
    const accounts = [
      { is_debt: true, balance: new Prisma.Decimal(0) },
      { is_debt: true, balance: new Prisma.Decimal(2500) },
    ] as Parameters<NonNullable<typeof def>['check']>[1];
    const result = def!.check(ZERO_PROFILE, accounts, 0);
    expect(result).toBe(true);
  });

  it('does not fire when no debt account has reached zero', () => {
    const accounts = [
      { is_debt: true, balance: new Prisma.Decimal(100) },
      { is_debt: true, balance: new Prisma.Decimal(2500) },
    ] as Parameters<NonNullable<typeof def>['check']>[1];
    const result = def!.check(ZERO_PROFILE, accounts, 0);
    expect(result).toBe(false);
  });

  it('does not fire when the only zero-balance account is non-debt', () => {
    const accounts = [
      { is_debt: false, balance: new Prisma.Decimal(0) },
      { is_debt: true, balance: new Prisma.Decimal(500) },
    ] as Parameters<NonNullable<typeof def>['check']>[1];
    const result = def!.check(ZERO_PROFILE, accounts, 0);
    expect(result).toBe(false);
  });
});

describe('MILESTONES — title doctrine', () => {
  // Doctrine §10 item 4: titles must be declarative noun phrases. No gamer
  // register, no rank superlatives, no streak titles. The streak category
  // was removed entirely; the discriminated union below pins that.
  const FORBIDDEN_PHRASES = [
    'First Blood',
    'DEBT FREE',
    'Wealth Mode',
    'Buffer Mode',
    'Cash Stack Building',
    'Starter Pack',
    'Quarter Millionaire',
    'Half Millionaire',
    'Million Dollar Moment',
    'Week Warrior',
    'Month Master',
    '90-Day Operator',
    'Financial Discipline',
    'Six-Figure Earner',
    'Top 5% Earner',
  ];

  it('contains no forbidden gamer-register phrases in any title', () => {
    for (const m of MILESTONES) {
      for (const phrase of FORBIDDEN_PHRASES) {
        expect(m.title).not.toContain(phrase);
      }
    }
  });

  it('exposes only declared milestone categories (no streak)', () => {
    const allowed = new Set(['cash', 'debt', 'networth', 'income']);
    for (const m of MILESTONES) {
      expect(allowed.has(m.category)).toBe(true);
    }
  });
});
