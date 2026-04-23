import { NetWorthService } from '../src/networth/networth.service';

describe('NetWorthService.getCurrentNetWorth — savings rate', () => {
  function buildPrismaMock(opts: {
    profile: any;
    accounts: any[];
    latestEOD?: any;
    oldBalances?: any[];
  }) {
    return {
      financialProfile: {
        findUnique: jest.fn().mockResolvedValue(opts.profile),
      },
      financialAccount: {
        findMany: jest.fn().mockResolvedValue(opts.accounts),
      },
      eODSubmission: {
        findFirst: jest.fn().mockResolvedValue(opts.latestEOD ?? null),
      },
      accountBalanceLog: {
        findMany: jest.fn().mockResolvedValue(opts.oldBalances ?? []),
      },
    } as any;
  }

  it('computes a positive savings_rate when savings accounts grew vs 30 days ago', async () => {
    const prisma = buildPrismaMock({
      profile: { monthly_income_gross: 5000, wealth_velocity_score: 0, streak_days: 0 },
      accounts: [
        { id: 'acc-sav', account_type: 'savings', is_debt: false, balance: 6000, is_active: true },
      ],
      oldBalances: [{ account_id: 'acc-sav', balance: 5000 }],
    });
    const svc = new NetWorthService(prisma);
    const result = await svc.getCurrentNetWorth('user-1');

    expect(result.monthly_income).toBe(5000);
    // $1000 growth / $5000 income = 0.2
    expect(result.savings_rate).toBeCloseTo(0.2, 5);
    expect(result.total_assets).toBe(6000);
    expect(result.total_debt).toBe(0);
    expect(result.net_worth).toBe(6000);
  });

  it('returns savings_rate=0 when monthly income is zero (avoids divide-by-zero)', async () => {
    const prisma = buildPrismaMock({
      profile: { monthly_income_gross: 0, wealth_velocity_score: 0, streak_days: 0 },
      accounts: [
        { id: 'acc-sav', account_type: 'savings', is_debt: false, balance: 10000, is_active: true },
      ],
      oldBalances: [{ account_id: 'acc-sav', balance: 5000 }],
    });
    const svc = new NetWorthService(prisma);
    const result = await svc.getCurrentNetWorth('user-1');
    expect(result.savings_rate).toBe(0);
  });
});
