import { Prisma } from '@prisma/client';
import { MILESTONES } from '../src/milestones/milestones.service';

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
    ];
    const result = def!.check({}, accounts, 0);
    expect(result).toBe(true);
  });

  it('does not fire when no debt account has reached zero', () => {
    const accounts = [
      { is_debt: true, balance: new Prisma.Decimal(100) },
      { is_debt: true, balance: new Prisma.Decimal(2500) },
    ];
    const result = def!.check({}, accounts, 0);
    expect(result).toBe(false);
  });

  it('does not fire when the only zero-balance account is non-debt', () => {
    const accounts = [
      { is_debt: false, balance: new Prisma.Decimal(0) },
      { is_debt: true, balance: new Prisma.Decimal(500) },
    ];
    const result = def!.check({}, accounts, 0);
    expect(result).toBe(false);
  });
});

describe('MILESTONES — title doctrine', () => {
  // Doctrine §10 item 4: titles must be declarative noun phrases. No gamer
  // register, no rank superlatives, no streak titles (streak category is
  // being removed in PR #98).
  // Phrases that must not appear in any milestone title. The matcher is
  // case-sensitive to avoid colliding with lowercase noun forms (the new
  // "Debt free" title is fine; only the shouty "DEBT FREE" was banned).
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

  it('has dropped every streak-category milestone', () => {
    const streakKeys = MILESTONES.filter((m) => m.category === 'streak');
    expect(streakKeys).toHaveLength(0);
  });
});
