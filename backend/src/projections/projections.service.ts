import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function fvAnnuity(pmt: number, r: number, n: number): number {
  if (r === 0) return pmt * n;
  return pmt * (Math.pow(1 + r, n) - 1) / r;
}

function fvCompound(pv: number, r: number, n: number): number {
  return pv * Math.pow(1 + r, n);
}

function debtPayoffMonths(balance: number, apr: number, monthlyPayment: number): number {
  const r = apr / 100 / 12;
  if (r === 0) return Math.ceil(balance / monthlyPayment);
  if (monthlyPayment <= balance * r) return Infinity;
  return Math.ceil(Math.log(monthlyPayment / (monthlyPayment - r * balance)) / Math.log(1 + r));
}

@Injectable()
export class ProjectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async runProjection(userId: string, params: {
    income_growth_pct?: number;
    savings_rate_pct?: number;
    investment_return_pct?: number;
    extra_debt_payment?: number;
    years?: number;
  }) {
    const [profile, accounts] = await Promise.all([
      this.prisma.financialProfile.findUnique({ where: { user_id: userId } }),
      this.prisma.financialAccount.findMany({ where: { user_id: userId, is_active: true } }),
    ]);

    const incomeGrowthPct = params.income_growth_pct ?? 5;
    const savingsRatePct = params.savings_rate_pct ?? 20;
    const investmentReturnPct = params.investment_return_pct ?? 8;
    const extraDebtPayment = params.extra_debt_payment ?? 0;
    const years = params.years ?? 10;

    const currentNetWorth = (profile?.net_worth_snapshot ?? 0);
    const monthlyIncome = profile?.monthly_income_gross ?? 0;
    const totalDebt = accounts.filter((a) => a.is_debt).reduce((s, a) => s + a.balance, 0);
    const totalAssets = accounts.filter((a) => !a.is_debt).reduce((s, a) => s + a.balance, 0);
    const totalMinPayments = accounts
      .filter((a) => a.is_debt && a.minimum_payment)
      .reduce((s, a) => s + (a.minimum_payment || 0), 0);

    const r_invest = investmentReturnPct / 100 / 12;
    const r_income = incomeGrowthPct / 100 / 12;

    const projections: Array<{ month: number; year: number; net_worth: number; debt: number; savings: number }> = [];

    let currentIncome = monthlyIncome;
    let remainingDebt = totalDebt;
    let savings = totalAssets;
    let netWorth = currentNetWorth;

    const checkpoints = [1, 3, 5, 10, 20].filter((y) => y <= years);

    for (let month = 1; month <= years * 12; month++) {
      // Income grows monthly at rate
      currentIncome *= (1 + incomeGrowthPct / 100 / 12);
      const savingsAmount = currentIncome * (savingsRatePct / 100);

      // Apply extra debt payments
      const debtPayment = Math.min(totalMinPayments + extraDebtPayment, remainingDebt);
      remainingDebt = Math.max(0, remainingDebt - debtPayment + (remainingDebt * 0.18 / 12)); // simplified interest

      // Grow savings with investment return
      savings = savings * (1 + r_invest) + savingsAmount;

      netWorth = savings - remainingDebt;

      if (month % 12 === 0 || checkpoints.includes(month / 12)) {
        projections.push({
          month,
          year: month / 12,
          net_worth: Math.round(netWorth),
          debt: Math.round(remainingDebt),
          savings: Math.round(savings),
        });
      }
    }

    // Three named scenarios for comparison
    const conservative = this.computeScenario(currentNetWorth, monthlyIncome, totalDebt, 2, 10, 6, 0, years);
    const realistic = this.computeScenario(currentNetWorth, monthlyIncome, totalDebt, incomeGrowthPct, savingsRatePct, investmentReturnPct, extraDebtPayment, years);
    const optimistic = this.computeScenario(currentNetWorth, monthlyIncome, totalDebt, 10, 30, 12, extraDebtPayment * 2, years);

    // FI Number
    const dreamMonthly = profile?.dream_lifestyle_cost_mo || monthlyIncome;
    const fiNumber = (dreamMonthly * 12) / 0.04;

    return {
      current_net_worth: currentNetWorth,
      fi_number: Math.round(fiNumber),
      fi_progress_pct: Math.min(100, Math.round((currentNetWorth / fiNumber) * 100)),
      projections,
      scenarios: { conservative, realistic, optimistic },
      params: { incomeGrowthPct, savingsRatePct, investmentReturnPct, extraDebtPayment, years },
    };
  }

  private computeScenario(
    currentNetWorth: number,
    monthlyIncome: number,
    totalDebt: number,
    incomeGrowthPct: number,
    savingsRatePct: number,
    returnPct: number,
    extraDebtPay: number,
    years: number,
  ) {
    const r = returnPct / 100 / 12;
    const annualIncome = monthlyIncome * 12;
    const monthlySavings = monthlyIncome * (savingsRatePct / 100);

    const projAtYear: Record<number, number> = {};
    for (const y of [1, 3, 5, 10]) {
      if (y <= years) {
        const growthFactor = Math.pow(1 + incomeGrowthPct / 100, y);
        const avgMonthlySavings = monthlySavings * (growthFactor + 1) / 2;
        const savingsGrowth = fvAnnuity(avgMonthlySavings, r, y * 12);
        const existingGrowth = fvCompound(currentNetWorth, returnPct / 100, y);
        const debtReduction = Math.min(totalDebt, extraDebtPay * y * 12);
        projAtYear[y] = Math.round(existingGrowth + savingsGrowth - (totalDebt - debtReduction));
      }
    }

    return projAtYear;
  }
}
