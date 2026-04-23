import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toN } from '../common/money';

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

    // Decimal fields are converted to Number by the DecimalToNumberInterceptor
    // on the outbound response; we return them as-is here.
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

    const total_assets = accounts.filter((a) => !a.is_debt).reduce((s, a) => s + toN(a.balance), 0);
    const total_debt = accounts.filter((a) => a.is_debt).reduce((s, a) => s + toN(a.balance), 0);
    const total_cash = accounts
      .filter((a) => ['checking', 'savings'].includes(a.account_type) && !a.is_debt)
      .reduce((s, a) => s + toN(a.balance), 0);

    const net_worth = total_assets - total_debt;

    // Get previous net worth from most recent EOD submission
    const latestEOD = await this.prisma.eODSubmission.findFirst({
      where: { user_id: userId },
      orderBy: { submission_date: 'desc' },
      select: { net_worth_computed: true },
    });

    // Compute monthly cash flow estimate
    const monthly_income = toN(profile?.monthly_income_gross);
    const monthly_minimums = accounts
      .filter((a) => a.is_debt && a.minimum_payment)
      .reduce((s, a) => s + toN(a.minimum_payment), 0);

    const estimated_expenses = monthly_income * 0.6;
    const monthly_cash_flow = monthly_income - monthly_minimums - estimated_expenses;

    // Debt to income ratio (total monthly minimums / gross monthly income)
    const dti_ratio = monthly_income > 0 ? monthly_minimums / monthly_income : 0;

    // Compute REAL savings rate from savings + investment account growth (not checking).
    // BUG FIX (round-2 stability PR): the previous filter used enum values
    // ['savings', 'investment', 'retirement'] which did NOT match the real
    // AccountType enum (savings / investment_brokerage / retirement_401k /
    // retirement_ira). That meant savings_rate was effectively always 0 for
    // users with retirement or brokerage accounts. See audit item H11.
    let savings_rate = 0;
    if (monthly_income > 0) {
      const savingsAccounts = accounts.filter(
        (a) =>
          !a.is_debt &&
          ['savings', 'investment_brokerage', 'retirement_401k', 'retirement_ira'].includes(
            a.account_type,
          ),
      );

      if (savingsAccounts.length > 0) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const savingsAccountIds = savingsAccounts.map((a) => a.id);

        // Get earliest balance log per savings/investment account in last 30 days
        const oldBalances = await this.prisma.accountBalanceLog.findMany({
          where: {
            account_id: { in: savingsAccountIds },
            date: { gte: thirtyDaysAgo },
          },
          orderBy: { date: 'asc' },
          distinct: ['account_id'],
          select: { account_id: true, balance: true },
        });

        const currentSavingsTotal = savingsAccounts.reduce((s, a) => s + toN(a.balance), 0);
        const oldSavingsTotal = oldBalances.reduce((s, b) => s + toN(b.balance), 0);
        const savingsGrowth = currentSavingsTotal - oldSavingsTotal;

        savings_rate = Math.max(0, Math.min(1, savingsGrowth / monthly_income));
      }
    }

    // Interest bleed per day
    const interest_bleed_daily = accounts
      .filter((a) => a.is_debt && a.apr_percent)
      .reduce((s, a) => s + (toN(a.balance) * (a.apr_percent || 0)) / 100 / 365, 0);

    return {
      net_worth,
      previous_net_worth: latestEOD ? toN(latestEOD.net_worth_computed) : net_worth,
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
