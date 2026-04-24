import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushSenderService } from '../push/push-sender.service';

// The 7-level Priority Waterfall — the core logic of TGP Finance
export const PRIORITY_WATERFALL = [
  {
    index: 0,
    title: 'Build $1,000 Cash Buffer',
    description: 'Establish a starter emergency fund before tackling debt.',
    category: 'cash',
    check: (profile: any, accounts: any[]) => {
      const cash = accounts
        .filter((a) => ['checking', 'savings'].includes(a.account_type) && !a.is_debt)
        .reduce((s, a) => s + a.balance, 0);
      return { complete: cash >= 1000, progress: Math.min(cash / 1000, 1), target: 1000, current: cash };
    },
  },
  {
    index: 1,
    title: 'Pay Off High-APR Unsecured Debt (>10% APR)',
    description: 'Eliminate all unsecured debt above 10% APR. Use avalanche (highest APR first) or snowball (lowest balance first) based on your motivation style.',
    category: 'debt',
    check: (profile: any, accounts: any[]) => {
      const highAprDebts = accounts.filter(
        (a) => a.is_debt && !a.is_secured && (a.apr_percent || 0) >= 10 && a.balance > 0,
      );
      const totalHighAprDebt = highAprDebts.reduce((s, a) => s + a.balance, 0);
      return {
        complete: highAprDebts.length === 0,
        progress: totalHighAprDebt > 0 ? 0 : 1,
        target: 0,
        current: totalHighAprDebt,
        debts: highAprDebts,
      };
    },
  },
  {
    index: 2,
    title: 'Build 3-Month Emergency Fund',
    description: 'Save 3 months of expenses (minimum $10,000) for true security.',
    category: 'cash',
    check: (profile: any, accounts: any[]) => {
      const cash = accounts
        .filter((a) => ['checking', 'savings'].includes(a.account_type) && !a.is_debt)
        .reduce((s, a) => s + a.balance, 0);
      const monthlyIncome = profile?.monthly_income_gross || 0;
      const monthlyExpenses = monthlyIncome * 0.6;
      const target = Math.max(monthlyExpenses * 3, 10000);
      return { complete: cash >= target, progress: Math.min(cash / target, 1), target, current: cash };
    },
  },
  {
    index: 3,
    title: 'Maximize Tax-Advantaged Investing',
    description: 'Max out 401k ($23,500/yr 2026) then Roth IRA ($7,000/yr 2026).',
    category: 'invest',
    check: (profile: any, accounts: any[]) => {
      const retirement = accounts.filter(
        (a) => ['retirement_401k', 'retirement_ira'].includes(a.account_type) && !a.is_debt,
      );
      const annualContributions = retirement.reduce((s, a) => s + a.balance, 0);
      // Approximate: if retirement accounts exist and have meaningful balance
      const target = 30500; // 23500 + 7000
      return {
        complete: annualContributions >= target,
        progress: Math.min(annualContributions / target, 1),
        target,
        current: annualContributions,
      };
    },
  },
  {
    index: 4,
    title: 'Build 6-Month Emergency Fund',
    description: 'Extend your safety net to 6 months of income (minimum $20,000).',
    category: 'cash',
    check: (profile: any, accounts: any[]) => {
      const cash = accounts
        .filter((a) => ['checking', 'savings'].includes(a.account_type) && !a.is_debt)
        .reduce((s, a) => s + a.balance, 0);
      const monthlyIncome = profile?.monthly_income_gross || 0;
      const target = Math.max(monthlyIncome * 6, 20000);
      return { complete: cash >= target, progress: Math.min(cash / target, 1), target, current: cash };
    },
  },
  {
    index: 5,
    title: 'Build Business Nest Egg',
    description: 'Save $25,000+ to fund a business or major income-building venture.',
    category: 'business',
    check: (profile: any, accounts: any[]) => {
      const businessSavings = accounts
        .filter(
          (a) =>
            !a.is_debt &&
            (a.name?.toLowerCase().includes('business') ||
              a.notes?.toLowerCase().includes('business')),
        )
        .reduce((s, a) => s + a.balance, 0);
      const target = 25000;
      return {
        complete: businessSavings >= target,
        progress: Math.min(businessSavings / target, 1),
        target,
        current: businessSavings,
      };
    },
  },
  {
    index: 6,
    title: 'Asset Building & Wealth Accumulation',
    description: 'Invest in diversified index funds, real estate, and income-generating assets. This priority evolves continuously.',
    category: 'wealth',
    check: (profile: any, accounts: any[]) => {
      const investments = accounts
        .filter(
          (a) =>
            !a.is_debt &&
            ['investment_brokerage', 'retirement_401k', 'retirement_ira', 'real_estate'].includes(
              a.account_type,
            ),
        )
        .reduce((s, a) => s + a.balance, 0);
      return { complete: false, progress: Math.min(investments / 1000000, 1), target: 1000000, current: investments };
    },
  },
];

@Injectable()
export class PrioritiesService {
  private readonly logger = new Logger(PrioritiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly pushSender?: PushSenderService,
  ) {}

  async getCurrentPriority(userId: string) {
    const [profile, accounts] = await Promise.all([
      this.prisma.financialProfile.findUnique({ where: { user_id: userId } }),
      this.prisma.financialAccount.findMany({ where: { user_id: userId, is_active: true } }),
    ]);

    return this.computeCurrentPriority(profile, accounts);
  }

  computeCurrentPriority(profile: any, accounts: any[]) {
    for (const priority of PRIORITY_WATERFALL) {
      const result = priority.check(profile, accounts);
      if (!result.complete) {
        const nextPriority = PRIORITY_WATERFALL[priority.index + 1];
        return {
          current: {
            ...priority,
            ...result,
            action_items: this.getActionItems(priority.index, profile, accounts, result as any),
            estimated_completion: this.estimateCompletion(priority.index, profile, accounts, result as any),
          },
          next: nextPriority
            ? { index: nextPriority.index, title: nextPriority.title }
            : null,
          current_index: priority.index,
        };
      }
    }

    // All priorities complete (unlikely at priority 6 since it never completes)
    const last = PRIORITY_WATERFALL[6];
    const result = last.check(profile, accounts);
    return {
      current: { ...last, ...result },
      next: null,
      current_index: 6,
    };
  }

  private getActionItems(idx: number, profile: any, accounts: any[], result: any): string[] {
    const income = profile?.monthly_income_gross || 0;
    switch (idx) {
      case 0:
        return [
          `Save $${Math.max(0, 1000 - (result.current || 0)).toFixed(0)} more in checking/savings`,
          'Avoid new discretionary spending until buffer is reached',
        ];
      case 1: {
        const debts: any[] = result.debts || [];
        const sorted =
          profile?.motivation_style === 'small_wins'
            ? [...debts].sort((a, b) => a.balance - b.balance)
            : [...debts].sort((a, b) => (b.apr_percent || 0) - (a.apr_percent || 0));
        if (sorted.length === 0) return ['No high-APR debt found!'];
        const top = sorted[0];
        return [
          `Focus extra payments on: ${top.name} ($${top.balance.toFixed(0)} at ${top.apr_percent}% APR)`,
          `Pay minimum payments on all other debts`,
          `Extra $200/mo toward ${top.name} = debt-free ${this.extraPaymentMonths(top.balance, top.apr_percent || 26, top.minimum_payment || 0, 200)} months sooner`,
        ];
      }
      case 2:
        return [
          `Build cash reserves to $${Math.max(0, result.target - result.current).toFixed(0)} more`,
          'Automate $X/mo transfer to savings',
        ];
      case 3:
        return [
          'Increase 401k contribution to max ($23,500/yr)',
          'Open or max Roth IRA ($7,000/yr)',
          'Consider HSA if eligible ($4,150 individual / $8,300 family 2026)',
        ];
      case 4:
        return [
          `Save $${Math.max(0, result.target - result.current).toFixed(0)} more for 6-month fund`,
          'Keep in high-yield savings account (4-5% APY)',
        ];
      case 5:
        return [
          'Open dedicated "Business Fund" savings account',
          `Save $${Math.max(0, result.target - result.current).toFixed(0)} more`,
          'Research business models that fit your skills',
        ];
      case 6:
        return [
          'Invest monthly surplus in index funds (VTI, VOO, or similar)',
          'Research rental real estate in your market',
          'Build income-generating assets',
        ];
      default:
        return [];
    }
  }

  private estimateCompletion(idx: number, profile: any, accounts: any[], result: any): string {
    const income = profile?.monthly_income_gross || 0;
    const monthlySavings = income * 0.2; // Estimate 20% savings rate
    if (monthlySavings <= 0) return 'Unknown';

    const remaining = result.target - result.current;
    if (remaining <= 0) return 'Completed';

    const months = Math.ceil(remaining / monthlySavings);
    if (months > 120) return 'Long-term goal';
    if (months <= 1) return 'This month';
    return `~${months} months`;
  }

  private extraPaymentMonths(balance: number, apr: number, minPayment: number, extra: number): number {
    const r = apr / 100 / 12;
    const pmt = minPayment + extra;
    if (pmt <= 0 || r <= 0) return 0;
    const months = Math.log(pmt / (pmt - r * balance)) / Math.log(1 + r);
    return Math.max(0, Math.ceil(months));
  }

  async getAllPriorities(userId: string) {
    const [profile, accounts] = await Promise.all([
      this.prisma.financialProfile.findUnique({ where: { user_id: userId } }),
      this.prisma.financialAccount.findMany({ where: { user_id: userId, is_active: true } }),
    ]);

    return PRIORITY_WATERFALL.map((priority) => {
      const result = priority.check(profile, accounts);
      return { ...priority, ...result };
    });
  }

  async advancePriority(userId: string) {
    const profile = await this.prisma.financialProfile.findUnique({ where: { user_id: userId } });
    const currentIdx = profile?.current_priority_index || 0;
    const newIdx = Math.min(currentIdx + 1, 6);

    await this.prisma.financialProfile.update({
      where: { user_id: userId },
      data: { current_priority_index: newIdx },
    });

    // Fire push for the coach-driven level-up too. Dedupe on priority_index
    // keeps it idempotent if the coach clicks advance twice.
    if (this.pushSender && newIdx > currentIdx) {
      const def = PRIORITY_WATERFALL[newIdx];
      await this.pushSender
        .send(userId, 'priority_levelup', {
          title: '⬆️ New priority unlocked',
          body: def?.title ?? `Priority ${newIdx}`,
          data: { priority_index: newIdx, screen: 'Priorities' },
        })
        .catch((e) => this.logger.warn(`levelup push failed: ${(e as Error).message}`));
    }

    return { previous_index: currentIdx, new_index: newIdx };
  }
}
