import { computeNetWorth, computeDailyInterest, computeInterestBreakdown, computeFINumber } from './financial';
import type { FinancialAccount } from '../types';

function acc(partial: Partial<FinancialAccount>): FinancialAccount {
  return {
    id: partial.id ?? 'acc',
    user_id: 'user-1',
    name: 'Test',
    account_type: partial.account_type ?? 'checking',
    balance: partial.balance ?? 0,
    is_debt: partial.is_debt ?? false,
    is_active: partial.is_active ?? true,
    currency: 'USD',
    apr_percent: partial.apr_percent,
    minimum_payment: partial.minimum_payment,
    created_at: '2026-01-01',
  } as FinancialAccount;
}

describe('computeNetWorth', () => {
  it('returns assets minus debts, splits cash from other assets', () => {
    const accounts: FinancialAccount[] = [
      acc({ id: '1', account_type: 'checking', balance: 1000 }),
      acc({ id: '2', account_type: 'savings', balance: 4000 }),
      acc({ id: '3', account_type: 'investment_brokerage', balance: 10000 }),
      acc({ id: '4', account_type: 'credit_card', balance: 2500, is_debt: true }),
    ];
    const r = computeNetWorth(accounts);
    expect(r.totalAssets).toBe(15000);
    expect(r.totalDebt).toBe(2500);
    expect(r.netWorth).toBe(12500);
    expect(r.totalCash).toBe(5000);
  });

  it('excludes inactive accounts', () => {
    const accounts: FinancialAccount[] = [
      acc({ id: '1', account_type: 'checking', balance: 1000 }),
      acc({ id: '2', account_type: 'savings', balance: 5000, is_active: false }),
    ];
    const r = computeNetWorth(accounts);
    expect(r.totalAssets).toBe(1000);
    expect(r.totalCash).toBe(1000);
  });
});

describe('computeDailyInterest', () => {
  it('returns zero when there are no debt accounts', () => {
    const accounts: FinancialAccount[] = [acc({ account_type: 'savings', balance: 10000 })];
    expect(computeDailyInterest(accounts)).toBe(0);
  });

  it('computes daily interest bleed across debt balances', () => {
    const accounts: FinancialAccount[] = [
      acc({ id: '1', is_debt: true, balance: 10000, apr_percent: 18.25, account_type: 'credit_card' }),
    ];
    // 10000 * 0.1825 / 365 = 5.00 exactly
    expect(computeDailyInterest(accounts)).toBeCloseTo(5, 5);
  });

  it('interest breakdown monthly is 30x daily', () => {
    const accounts: FinancialAccount[] = [
      acc({ id: '1', is_debt: true, balance: 5000, apr_percent: 24, account_type: 'credit_card' }),
    ];
    const [row] = computeInterestBreakdown(accounts);
    expect(row.monthly).toBeCloseTo(row.daily * 30, 5);
    expect(row.annual).toBeCloseTo(row.daily * 365, 5);
  });
});

describe('computeFINumber — client/server parity', () => {
  // Doctrine §10 item 7. The server (backend/src/whatif/whatif.service.ts)
  // computes FI number as annualNeeded / 0.04 with no buffer. The client
  // previously applied a silent ×1.20 inflation buffer, so the same input
  // produced a 20% larger headline on mobile. Pin the parity here.
  function serverFINumber(monthly: number) {
    return (monthly * 12) / 0.04;
  }

  it('matches the server formula for a typical input', () => {
    expect(computeFINumber(5000)).toBe(serverFINumber(5000));
  });

  it('matches the server formula across a range of inputs', () => {
    for (const monthly of [1000, 2500, 5000, 8000, 12500, 25000]) {
      expect(computeFINumber(monthly)).toBeCloseTo(serverFINumber(monthly), 6);
    }
  });
});
