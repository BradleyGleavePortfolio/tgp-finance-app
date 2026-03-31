import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NetWorthService {
  constructor(private readonly prisma: PrismaService) {}

  async getNetWorthHistory(userId: string, days: number = 90) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const submissions = await this.prisma.eODSubmission.findMany({
      where: { user_id: userId, submitted_at: { gte: since } },
      orderBy: { submission_date: 'asc' },
      select: {
        submission_date: true,
        net_worth_computed: true,
        total_assets_computed: true,
        total_debt_computed: true,
        total_cash_computed: true,
      },
    });

    return submissions.map((s) => ({
      date: s.submission_date,
      net_worth: s.net_worth_computed,
      total_assets: s.total_assets_computed,
      total_debt: s.total_debt_computed,
      total_cash: s.total_cash_computed,
    }));
  }

  async getCurrentNetWorth(userId: string) {
    const profile = await this.prisma.financialProfile.findUnique({
      where: { user_id: userId },
    });

    const accounts = await this.prisma.financialAccount.findMany({
      where: { user_id: userId, is_active: true },
    });

    const total_assets = accounts.filter((a) => !a.is_debt).reduce((s, a) => s + a.balance, 0);
    const total_debt = accounts.filter((a) => a.is_debt).reduce((s, a) => s + a.balance, 0);
    const total_cash = accounts
      .filter((a) => ['checking', 'savings'].includes(a.account_type) && !a.is_debt)
      .reduce((s, a) => s + a.balance, 0);

    const net_worth = total_assets - total_debt;

    // Get previous net worth from most recent EOD submission
    const latestEOD = await this.prisma.eODSubmission.findFirst({
      where: { user_id: userId },
      orderBy: { submission_date: 'desc' },
      select: { net_worth_computed: true },
    });

    // Compute monthly cash flow estimate
    const monthly_income = profile?.monthly_income_gross || 0;
    const monthly_minimums = accounts
      .filter((a) => a.is_debt && a.minimum_payment)
      .reduce((s, a) => s + (a.minimum_payment || 0), 0);

    const estimated_expenses = monthly_income * 0.6;
    const monthly_cash_flow = monthly_income - monthly_minimums - estimated_expenses;

    // Debt to income ratio (total monthly minimums / gross monthly income)
    const dti_ratio = monthly_income > 0 ? monthly_minimums / monthly_income : 0;

    // Savings rate (take_home - expenses) / take_home
    const savings_rate = monthly_income > 0
      ? Math.max(0, (monthly_income - estimated_expenses) / monthly_income)
      : 0;

    // Interest bleed per day
    const interest_bleed_daily = accounts
      .filter((a) => a.is_debt && a.apr_percent)
      .reduce((s, a) => s + (a.balance * (a.apr_percent || 0)) / 100 / 365, 0);

    return {
      net_worth,
      previous_net_worth: latestEOD?.net_worth_computed ?? net_worth,
      total_assets,
      total_debt,
      total_cash,
      monthly_cash_flow,
      dti_ratio,
      savings_rate,
      monthly_income,
      interest_bleed_daily,
      interest_bleed_monthly: interest_bleed_daily * 30,
      interest_bleed_annual: interest_bleed_daily * 365,
      wealth_velocity_score: profile?.wealth_velocity_score || 0,
      streak_days: profile?.streak_days || 0,
    };
  }
}
