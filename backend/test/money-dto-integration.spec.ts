import { Prisma } from '@prisma/client';
import {
  CreateAccountSchema,
  UpdateAccountSchema,
  SubmitEODSchema,
  SubmitQuizSchema,
  DeployPaycheckSchema,
} from '../src/common/validators/schemas';

// These tests exercise the DTO layer directly (no controller/HTTP boot) so
// they remain hermetic. They validate end-to-end that:
//   - valid request payloads produce Prisma.Decimal in parsed.data
//   - invalid money values are rejected before reaching the service
// matching the contract a controller test would assert via 200/400.

const VALID_UUID = '00000000-0000-4000-8000-000000000000';

describe('Money DTOs — Account write surface', () => {
  it('accepts a CreateAccount request and emits Prisma.Decimal balance', () => {
    const result = CreateAccountSchema.safeParse({
      name: 'Main Checking',
      account_type: 'checking',
      balance: '1234.56',
      currency: 'USD',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.balance).toBeInstanceOf(Prisma.Decimal);
      expect(result.data.balance.toFixed(2)).toBe('1234.56');
    }
  });

  it('accepts a number balance and coerces to Decimal', () => {
    const result = CreateAccountSchema.safeParse({
      name: 'Main',
      account_type: 'savings',
      balance: 500,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.balance.toString()).toBe('500');
    }
  });

  it('rejects a balance with too many decimals', () => {
    const result = CreateAccountSchema.safeParse({
      name: 'Main',
      account_type: 'checking',
      balance: '1.234',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-numeric balance string', () => {
    const result = CreateAccountSchema.safeParse({
      name: 'Main',
      account_type: 'checking',
      balance: 'abc',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative minimum_payment', () => {
    const result = CreateAccountSchema.safeParse({
      name: 'CC',
      account_type: 'credit_card',
      balance: 100,
      minimum_payment: '-10',
    });
    expect(result.success).toBe(false);
  });

  it('UpdateAccount partial accepts a single Decimal balance update', () => {
    const result = UpdateAccountSchema.safeParse({ balance: '250.00' });
    expect(result.success).toBe(true);
    if (result.success && result.data.balance) {
      expect(result.data.balance).toBeInstanceOf(Prisma.Decimal);
      expect(result.data.balance.toFixed(2)).toBe('250.00');
    }
  });
});

describe('Money DTOs — EOD write surface', () => {
  it('accepts an EOD submission with Decimal snapshot balances', () => {
    const result = SubmitEODSchema.safeParse({
      submission_date: '2026-04-29',
      account_snapshots: [
        { account_id: VALID_UUID, balance: '1000.00' },
        { account_id: VALID_UUID, balance: 250.5 },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      for (const snap of result.data.account_snapshots) {
        expect(snap.balance).toBeInstanceOf(Prisma.Decimal);
      }
      expect(result.data.account_snapshots[0].balance.toFixed(2)).toBe('1000.00');
      expect(result.data.account_snapshots[1].balance.toFixed(2)).toBe('250.50');
    }
  });

  it('rejects EOD with > 2 decimals on any snapshot', () => {
    const result = SubmitEODSchema.safeParse({
      submission_date: '2026-04-29',
      account_snapshots: [{ account_id: VALID_UUID, balance: '1.234' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects EOD with NaN balance', () => {
    const result = SubmitEODSchema.safeParse({
      submission_date: '2026-04-29',
      account_snapshots: [{ account_id: VALID_UUID, balance: NaN }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects EOD with Infinity balance', () => {
    const result = SubmitEODSchema.safeParse({
      submission_date: '2026-04-29',
      account_snapshots: [{ account_id: VALID_UUID, balance: Infinity }],
    });
    expect(result.success).toBe(false);
  });

  it('allows EOD with negative balance (overdrawn account)', () => {
    const result = SubmitEODSchema.safeParse({
      submission_date: '2026-04-29',
      account_snapshots: [{ account_id: VALID_UUID, balance: '-50.00' }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.account_snapshots[0].balance.isNegative()).toBe(true);
    }
  });
});

describe('Money DTOs — Onboarding quiz', () => {
  it('accepts a quiz submission with Decimal monthly_take_home', () => {
    const result = SubmitQuizSchema.safeParse({
      answers: {
        risk_tolerance: 'Moderate',
        investment_horizon: '5+ years',
        financial_goal: 'retire_early',
        income_range: '$100k-$200k',
        monthly_take_home: '7500.00',
        monthly_dream_cost: '12000',
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.answers.monthly_take_home).toBeInstanceOf(Prisma.Decimal);
      expect(result.data.answers.monthly_take_home!.toFixed(2)).toBe('7500.00');
      expect(result.data.answers.monthly_dream_cost!.toFixed(2)).toBe('12000.00');
    }
  });

  it('rejects quiz monthly_take_home with too many decimals', () => {
    const result = SubmitQuizSchema.safeParse({
      answers: {
        risk_tolerance: 'Moderate',
        investment_horizon: '1-3 years',
        financial_goal: 'debt_free',
        income_range: '$50k-$100k',
        monthly_take_home: '7500.999',
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects quiz monthly_take_home of "abc"', () => {
    const result = SubmitQuizSchema.safeParse({
      answers: {
        risk_tolerance: 'Moderate',
        investment_horizon: '1-3 years',
        financial_goal: 'debt_free',
        income_range: '$50k-$100k',
        monthly_take_home: 'abc',
      },
    });
    expect(result.success).toBe(false);
  });

  it('allows quiz with no money fields (all optional)', () => {
    const result = SubmitQuizSchema.safeParse({
      answers: {
        risk_tolerance: 'Conservative',
        investment_horizon: '5+ years',
        financial_goal: 'retire_early',
        income_range: '$100k-$200k',
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('Money DTOs — Payday deploy', () => {
  it('accepts a paycheck deployment with Decimal amounts', () => {
    const result = DeployPaycheckSchema.safeParse({
      paycheck_amount: '5000.00',
      allocations: [
        { account_id: VALID_UUID, amount: '2000' },
        { account_id: VALID_UUID, amount: 1500.25 },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.paycheck_amount).toBeInstanceOf(Prisma.Decimal);
      expect(result.data.paycheck_amount.toFixed(2)).toBe('5000.00');
      expect(result.data.allocations[0].amount).toBeInstanceOf(Prisma.Decimal);
      expect(result.data.allocations[1].amount.toFixed(2)).toBe('1500.25');
    }
  });

  it('rejects zero paycheck_amount (must be positive)', () => {
    const result = DeployPaycheckSchema.safeParse({
      paycheck_amount: '0',
      allocations: [{ account_id: VALID_UUID, amount: '0' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative paycheck_amount', () => {
    const result = DeployPaycheckSchema.safeParse({
      paycheck_amount: '-100',
      allocations: [{ account_id: VALID_UUID, amount: '50' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects allocation with > 2 decimal places', () => {
    const result = DeployPaycheckSchema.safeParse({
      paycheck_amount: '5000',
      allocations: [{ account_id: VALID_UUID, amount: '100.123' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty allocations array', () => {
    const result = DeployPaycheckSchema.safeParse({
      paycheck_amount: '5000',
      allocations: [],
    });
    expect(result.success).toBe(false);
  });
});
