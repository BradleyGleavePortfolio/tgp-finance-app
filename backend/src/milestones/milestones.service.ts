import { Injectable } from '@nestjs/common';
import { FinancialAccount, FinancialProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toN } from '../common/money';

// Profile fields the milestone checks read. We don't need every column on
// FinancialProfile, just the numeric/Decimal ones referenced below.
type MilestoneProfile = Pick<
  FinancialProfile,
  'total_cash' | 'total_debt' | 'net_worth_snapshot' | 'annual_income_gross'
> | null;

type MilestoneCheck = (
  profile: MilestoneProfile,
  accounts: FinancialAccount[],
  onboardingDebt: number,
) => boolean;

interface MilestoneDef {
  key: string;
  title: string;
  description: string;
  category: 'cash' | 'debt' | 'networth' | 'income';
  check: MilestoneCheck;
}

// All 18 milestone definitions with unlock conditions. Titles are declarative
// noun phrases per the doctrine — no gamer register, no rank-style superlatives.
// The first_debt_paid and debt_zero checks use toN() because Prisma returns
// Decimal instances for money columns and `Decimal(0) === 0` is always false
// in JS — see backend/src/common/money.ts.
export const MILESTONES: MilestoneDef[] = [
  // CASH milestones
  { key: 'cash_1k', title: 'Starter buffer reached', description: 'First $1,000 in cash', category: 'cash', check: (p) => toN(p?.total_cash) >= 1000 },
  { key: 'cash_5k', title: 'Cash buffer reached', description: '$5,000 in cash', category: 'cash', check: (p) => toN(p?.total_cash) >= 5000 },
  { key: 'cash_10k', title: '$10,000 in cash', description: '$10,000 in cash', category: 'cash', check: (p) => toN(p?.total_cash) >= 10000 },
  { key: 'cash_20k', title: 'Emergency fund complete', description: '$20,000 in cash', category: 'cash', check: (p) => toN(p?.total_cash) >= 20000 },

  // DEBT milestones
  { key: 'first_debt_paid', title: 'First debt cleared', description: 'First debt account reaches $0', category: 'debt', check: (_p, accounts) => accounts.some((a) => a.is_debt && toN(a.balance) === 0) },
  { key: 'debt_half', title: 'Halfway to FI', description: 'Total debt cut in half vs onboarding', category: 'debt', check: (p, _accounts, onboardDebt) => onboardDebt > 0 && toN(p?.total_debt) <= onboardDebt / 2 },
  { key: 'debt_zero', title: 'Debt free', description: 'All debt cleared', category: 'debt', check: (p) => toN(p?.total_debt) === 0 },

  // NET WORTH milestones
  { key: 'nw_positive', title: 'Net worth positive', description: 'Net worth turns positive', category: 'networth', check: (p) => toN(p?.net_worth_snapshot) > 0 },
  { key: 'nw_1k', title: 'Net worth $1,000', description: '$1K net worth', category: 'networth', check: (p) => toN(p?.net_worth_snapshot) >= 1000 },
  { key: 'nw_5k', title: 'Net worth $5,000', description: '$5K net worth', category: 'networth', check: (p) => toN(p?.net_worth_snapshot) >= 5000 },
  { key: 'nw_10k', title: 'Net worth $10,000', description: '$10K net worth', category: 'networth', check: (p) => toN(p?.net_worth_snapshot) >= 10000 },
  { key: 'nw_25k', title: 'Net worth $25,000', description: '$25K net worth', category: 'networth', check: (p) => toN(p?.net_worth_snapshot) >= 25000 },
  { key: 'nw_50k', title: 'Wealth building underway', description: '$50K net worth', category: 'networth', check: (p) => toN(p?.net_worth_snapshot) >= 50000 },
  { key: 'nw_100k', title: 'Net worth $100,000', description: '$100K net worth', category: 'networth', check: (p) => toN(p?.net_worth_snapshot) >= 100000 },
  { key: 'nw_250k', title: 'Net worth $250,000', description: '$250K net worth', category: 'networth', check: (p) => toN(p?.net_worth_snapshot) >= 250000 },
  { key: 'nw_500k', title: 'Net worth $500,000', description: '$500K net worth', category: 'networth', check: (p) => toN(p?.net_worth_snapshot) >= 500000 },
  { key: 'nw_1m', title: 'Net worth $1,000,000', description: '$1M net worth', category: 'networth', check: (p) => toN(p?.net_worth_snapshot) >= 1000000 },

  // INCOME milestones
  { key: 'income_100k', title: 'Income $100,000', description: 'Annual income reaches $100K', category: 'income', check: (p) => toN(p?.annual_income_gross) >= 100000 },
  { key: 'income_200k', title: 'Income top 5%', description: 'Annual income reaches $200K', category: 'income', check: (p) => toN(p?.annual_income_gross) >= 200000 },
];

@Injectable()
export class MilestonesService {
  constructor(private readonly prisma: PrismaService) {}

  async getMilestones(userId: string) {
    const [profile, accounts, unlocked] = await Promise.all([
      this.prisma.financialProfile.findUnique({ where: { user_id: userId } }),
      this.prisma.financialAccount.findMany({ where: { user_id: userId } }),
      this.prisma.milestoneUnlock.findMany({ where: { user_id: userId } }),
    ]);

    const unlockedKeys = new Set(unlocked.map((m) => m.milestone_key));

    return MILESTONES.map((m) => ({
      key: m.key,
      title: m.title,
      description: m.description,
      category: m.category,
      unlocked: unlockedKeys.has(m.key),
      unlocked_at: unlocked.find((u) => u.milestone_key === m.key)?.unlocked_at || null,
      celebrated: unlocked.find((u) => u.milestone_key === m.key)?.celebrated || false,
    }));
  }

  async checkAndUnlockMilestones(userId: string): Promise<string[]> {
    const [profile, accounts, alreadyUnlocked] = await Promise.all([
      this.prisma.financialProfile.findUnique({ where: { user_id: userId } }),
      this.prisma.financialAccount.findMany({ where: { user_id: userId, is_active: true } }),
      this.prisma.milestoneUnlock.findMany({ where: { user_id: userId } }),
    ]);

    const alreadyUnlockedKeys = new Set(alreadyUnlocked.map((m) => m.milestone_key));

    // Calculate onboarding debt (first-ever EOD or account creation totals)
    const onboardingDebt = await this.getOnboardingDebt(userId, accounts);

    const newlyUnlocked: string[] = [];

    for (const milestone of MILESTONES) {
      if (alreadyUnlockedKeys.has(milestone.key)) continue;

      const isUnlocked = milestone.check(profile, accounts, onboardingDebt);

      if (isUnlocked) {
        await this.prisma.milestoneUnlock.create({
          data: { user_id: userId, milestone_key: milestone.key },
        });
        newlyUnlocked.push(milestone.key);
      }
    }

    return newlyUnlocked;
  }

  private async getOnboardingDebt(
    userId: string,
    accounts: FinancialAccount[],
  ): Promise<number> {
    // Use earliest account balance logs to approximate onboarding debt
    const earliest = await this.prisma.accountBalanceLog.findFirst({
      where: { account: { user_id: userId }, source: 'onboarding' },
      orderBy: { logged_at: 'asc' },
    });

    if (!earliest) {
      return accounts.filter((a) => a.is_debt).reduce((s, a) => s + toN(a.balance), 0);
    }

    const onboardingLogs = await this.prisma.accountBalanceLog.findMany({
      where: { account: { user_id: userId }, source: 'onboarding' },
      include: { account: { select: { is_debt: true } } },
    });

    return onboardingLogs
      .filter((l) => l.account.is_debt)
      .reduce((s, l) => s + toN(l.balance), 0);
  }

  async markCelebrated(userId: string, milestoneKey: string) {
    await this.prisma.milestoneUnlock.updateMany({
      where: { user_id: userId, milestone_key: milestoneKey },
      data: { celebrated: true },
    });
    return { message: 'Milestone marked as celebrated' };
  }
}
