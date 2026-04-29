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

// All 15 milestone definitions with unlock conditions
export const MILESTONES: MilestoneDef[] = [
  // CASH milestones
  { key: 'cash_1k', title: 'Starter Pack Achieved', description: 'First $1,000 in cash', category: 'cash', check: (p) => toN(p?.total_cash) >= 1000 },
  { key: 'cash_5k', title: 'Buffer Mode Unlocked', description: '$5,000 in cash', category: 'cash', check: (p) => toN(p?.total_cash) >= 5000 },
  { key: 'cash_10k', title: 'Cash Stack Building', description: '$10,000 in cash', category: 'cash', check: (p) => toN(p?.total_cash) >= 10000 },
  { key: 'cash_20k', title: 'Emergency Fund: Complete', description: '$20,000 in cash', category: 'cash', check: (p) => toN(p?.total_cash) >= 20000 },

  // DEBT milestones
  { key: 'first_debt_paid', title: 'First Blood: Debt Slayer', description: 'First debt account reaches $0', category: 'debt', check: (_p, accounts) => accounts.some((a) => a.is_debt && toN(a.balance) === 0) },
  { key: 'debt_half', title: 'Halfway There', description: 'Total debt cut in half vs onboarding', category: 'debt', check: (p, _accounts, onboardDebt) => onboardDebt > 0 && toN(p?.total_debt) <= onboardDebt / 2 },
  { key: 'debt_zero', title: 'DEBT FREE — Wealth Mode Unlocked', description: 'All debt = $0', category: 'debt', check: (p) => toN(p?.total_debt) === 0 },

  // NET WORTH milestones
  { key: 'nw_positive', title: 'Into the Black', description: 'Net worth turns positive', category: 'networth', check: (p) => toN(p?.net_worth_snapshot) > 0 },
  { key: 'nw_1k', title: 'First Rung', description: '$1K net worth', category: 'networth', check: (p) => toN(p?.net_worth_snapshot) >= 1000 },
  { key: 'nw_5k', title: 'Climbing', description: '$5K net worth', category: 'networth', check: (p) => toN(p?.net_worth_snapshot) >= 5000 },
  { key: 'nw_10k', title: 'Five Figures', description: '$10K net worth', category: 'networth', check: (p) => toN(p?.net_worth_snapshot) >= 10000 },
  { key: 'nw_25k', title: 'Quarter to Fifty', description: '$25K net worth', category: 'networth', check: (p) => toN(p?.net_worth_snapshot) >= 25000 },
  { key: 'nw_50k', title: 'Wealth Builder', description: '$50K net worth', category: 'networth', check: (p) => toN(p?.net_worth_snapshot) >= 50000 },
  { key: 'nw_100k', title: 'Six Figures', description: '$100K net worth', category: 'networth', check: (p) => toN(p?.net_worth_snapshot) >= 100000 },
  { key: 'nw_250k', title: 'Quarter Millionaire', description: '$250K net worth', category: 'networth', check: (p) => toN(p?.net_worth_snapshot) >= 250000 },
  { key: 'nw_500k', title: 'Half Millionaire', description: '$500K net worth', category: 'networth', check: (p) => toN(p?.net_worth_snapshot) >= 500000 },
  { key: 'nw_1m', title: 'The Million Dollar Moment', description: '$1M net worth', category: 'networth', check: (p) => toN(p?.net_worth_snapshot) >= 1000000 },

  // INCOME milestones
  { key: 'income_100k', title: 'Six-Figure Earner', description: 'Annual income hits $100K', category: 'income', check: (p) => toN(p?.annual_income_gross) >= 100000 },
  { key: 'income_200k', title: 'Top 5% Earner', description: 'Annual income hits $200K', category: 'income', check: (p) => toN(p?.annual_income_gross) >= 200000 },
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
