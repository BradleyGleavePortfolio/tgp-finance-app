import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as path from 'path';
import * as fs from 'fs';

// Financial math helpers
function fv(pv: number, r: number, n: number): number {
  // FV = PV × (1 + r)^n  (compound interest on lump sum)
  return pv * Math.pow(1 + r, n);
}

function fvAnnuity(pmt: number, r: number, n: number): number {
  // FV = PMT × ((1+r)^n - 1) / r  (future value of periodic payments)
  if (r === 0) return pmt * n;
  return pmt * (Math.pow(1 + r, n) - 1) / r;
}

function debtPayoffMonths(balance: number, apr: number, monthlyPayment: number): number {
  const r = apr / 100 / 12;
  if (r === 0) return Math.ceil(balance / monthlyPayment);
  if (monthlyPayment <= balance * r) return Infinity; // Can't pay off
  return Math.ceil(Math.log(monthlyPayment / (monthlyPayment - r * balance)) / Math.log(1 + r));
}

function totalInterestPaid(balance: number, apr: number, monthlyPayment: number): number {
  const months = debtPayoffMonths(balance, apr, monthlyPayment);
  if (!isFinite(months)) return Infinity;
  return months * monthlyPayment - balance;
}

@Injectable()
export class WhatIfService {
  constructor(private readonly prisma: PrismaService) {}

  private loadCostOfLivingData(): any[] {
    // Try multiple possible paths (works from both ts-node dev and compiled dist)
    const candidates = [
      path.resolve(__dirname, '..', '..', '..', '..', 'data', 'cost_of_living_2026.json'), // from dist/src/whatif/
      path.resolve(__dirname, '..', '..', '..', 'data', 'cost_of_living_2026.json'),        // from src/whatif/
      path.resolve(process.cwd(), '..', 'data', 'cost_of_living_2026.json'),                // from backend/ cwd
      path.resolve(process.cwd(), 'data', 'cost_of_living_2026.json'),                      // from project root cwd
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
      }
    }
    return [];
  }

  async runScenario(userId: string, scenarioType: string, parameters: any): Promise<any> {
    const [profile, accounts] = await Promise.all([
      this.prisma.financialProfile.findUnique({ where: { user_id: userId } }),
      this.prisma.financialAccount.findMany({ where: { user_id: userId, is_active: true } }),
    ]);

    const monthlyIncome = profile?.monthly_income_gross || 0;
    const totalDebt = accounts.filter((a) => a.is_debt).reduce((s, a) => s + a.balance, 0);
    const totalAssets = accounts.filter((a) => !a.is_debt).reduce((s, a) => s + a.balance, 0);
    const netWorth = totalAssets - totalDebt;

    switch (scenarioType) {
      case 'extra_debt_payment':
        return this.scenarioExtraDebtPayment(accounts, parameters, netWorth);

      case 'income_increase':
        return this.scenarioIncomeIncrease(profile, accounts, parameters, netWorth);

      case 'relocate_country':
        return this.scenarioRelocateCountry(profile, parameters, netWorth);

      case 'relocate_city':
        return this.scenarioRelocateCity(profile, parameters, netWorth);

      case 'cut_expense':
        return this.scenarioCutExpense(parameters, netWorth);

      case 'invest_lump_sum':
        return this.scenarioInvestLumpSum(parameters, netWorth);

      case 'sell_asset':
        return this.scenarioSellAsset(accounts, parameters, netWorth);

      case 'start_business':
        return this.scenarioStartBusiness(profile, parameters, netWorth);

      case 'pay_off_debt_early':
        return this.scenarioPayOffDebtEarly(accounts, parameters, netWorth);

      case 'salary_negotiation':
        return this.scenarioSalaryNegotiation(profile, parameters, netWorth);

      case 'tax_optimization':
        return this.scenarioTaxOptimization(profile, parameters, netWorth);

      case 'retire_early':
        return this.scenarioRetireEarly(profile, parameters, netWorth);

      default:
        throw new BadRequestException({ error: `Unknown scenario type: ${scenarioType}`, code: 'INVALID_SCENARIO' });
    }
  }

  private scenarioExtraDebtPayment(accounts: any[], params: any, currentNetWorth: number) {
    const accountId = params.account_id;
    const extraMonthly = params.extra_monthly || 200;

    let targetAccounts = accountId
      ? accounts.filter((a) => a.id === accountId && a.is_debt)
      : accounts.filter((a) => a.is_debt && a.apr_percent && a.balance > 0)
          .sort((a, b) => (b.apr_percent || 0) - (a.apr_percent || 0));

    if (targetAccounts.length === 0) {
      return { error: 'No debt accounts found', result_summary: {}, projection_1yr: currentNetWorth };
    }

    const target = targetAccounts[0];
    const minPay = target.minimum_payment || 100;
    const normalMonths = debtPayoffMonths(target.balance, target.apr_percent || 20, minPay);
    const fastMonths = debtPayoffMonths(target.balance, target.apr_percent || 20, minPay + extraMonthly);
    const normalInterest = totalInterestPaid(target.balance, target.apr_percent || 20, minPay);
    const fastInterest = totalInterestPaid(target.balance, target.apr_percent || 20, minPay + extraMonthly);

    const interestSaved = normalInterest - fastInterest;
    const monthsSaved = normalMonths - fastMonths;

    // After payoff: redirect extra payment to investing at 8%
    const monthsToInvest = Math.max(0, 120 - fastMonths); // 10yr horizon minus payoff
    const investingValue = fvAnnuity(minPay + extraMonthly, 0.08 / 12, monthsToInvest);

    const netWorthImpact1yr = currentNetWorth + extraMonthly * 12;
    const netWorthImpact3yr = currentNetWorth + extraMonthly * 36;
    const netWorthImpact5yr = currentNetWorth + extraMonthly * 60;
    const netWorthImpact10yr = currentNetWorth + extraMonthly * 120 + investingValue;

    return {
      result_summary: {
        account: target.name,
        extra_monthly: extraMonthly,
        normal_payoff_months: isFinite(normalMonths) ? normalMonths : null,
        fast_payoff_months: isFinite(fastMonths) ? fastMonths : null,
        months_saved: isFinite(monthsSaved) ? monthsSaved : null,
        interest_saved: Math.round(interestSaved),
        monthly_freed_after_payoff: Math.round(minPay + extraMonthly),
        investing_value_after_payoff: Math.round(investingValue),
        narrative: `Putting an extra $${extraMonthly}/month toward your ${target.name} saves you $${Math.round(interestSaved).toLocaleString()} in interest and frees up $${Math.round(minPay + extraMonthly)}/mo in ${fastMonths} months.`,
      },
      projection_1yr: Math.round(netWorthImpact1yr),
      projection_3yr: Math.round(netWorthImpact3yr),
      projection_5yr: Math.round(netWorthImpact5yr),
      projection_10yr: Math.round(netWorthImpact10yr),
    };
  }

  private scenarioIncomeIncrease(profile: any, accounts: any[], params: any, currentNetWorth: number) {
    const raiseAmount = params.raise_amount || 0;
    const raisePct = params.raise_pct || 0;
    const currentGross = profile?.monthly_income_gross || 0;
    const newGross = raiseAmount
      ? currentGross + raiseAmount
      : currentGross * (1 + raisePct / 100);

    const effectiveTaxRate = 0.22; // Approximate
    const newTakeHome = newGross * (1 - effectiveTaxRate);
    const currentTakeHome = currentGross * (1 - effectiveTaxRate);
    const monthlyIncrease = newTakeHome - currentTakeHome;

    // Savings rate improvement
    const newSavingsRate = 0.2; // Assume keep same spending
    const additionalSavings = monthlyIncrease;

    const r = 0.08 / 12;
    const p1yr = currentNetWorth + fvAnnuity(additionalSavings, r, 12);
    const p3yr = currentNetWorth + fvAnnuity(additionalSavings, r, 36);
    const p5yr = currentNetWorth + fvAnnuity(additionalSavings, r, 60);
    const p10yr = currentNetWorth + fvAnnuity(additionalSavings, r, 120);

    return {
      result_summary: {
        current_gross_monthly: Math.round(currentGross),
        new_gross_monthly: Math.round(newGross),
        monthly_take_home_increase: Math.round(monthlyIncrease),
        annual_take_home_increase: Math.round(monthlyIncrease * 12),
        additional_net_worth_10yr: Math.round(p10yr - currentNetWorth),
        narrative: `A $${Math.round(newGross - currentGross).toLocaleString()}/mo gross increase adds $${Math.round(monthlyIncrease).toLocaleString()}/mo take-home. Invested at 8%, that's $${Math.round(p10yr - currentNetWorth).toLocaleString()} additional net worth in 10 years.`,
      },
      projection_1yr: Math.round(p1yr),
      projection_3yr: Math.round(p3yr),
      projection_5yr: Math.round(p5yr),
      projection_10yr: Math.round(p10yr),
    };
  }

  private scenarioRelocateCountry(profile: any, params: any, currentNetWorth: number) {
    const city = params.city || params.country || 'Medellin';
    const colData = this.loadCostOfLivingData();
    const destination = colData.find(
      (c) => c.city?.toLowerCase().includes(city.toLowerCase()) ||
             c.country?.toLowerCase().includes(city.toLowerCase()),
    );

    const currentMonthlyUSD = 3500; // Typical US single-person cost
    const destinationMonthly = destination?.monthly_cost_usd || 2000;
    const savings = currentMonthlyUSD - destinationMonthly;
    const annualSavings = savings * 12;
    const purchasingPowerMultiplier = (currentMonthlyUSD / destinationMonthly).toFixed(2);

    const r = 0.08 / 12;
    const p1yr = currentNetWorth + fvAnnuity(Math.max(savings, 0), r, 12);
    const p3yr = currentNetWorth + fvAnnuity(Math.max(savings, 0), r, 36);
    const p5yr = currentNetWorth + fvAnnuity(Math.max(savings, 0), r, 60);
    const p10yr = currentNetWorth + fvAnnuity(Math.max(savings, 0), r, 120);

    return {
      result_summary: {
        destination: destination ? `${destination.city}, ${destination.country}` : city,
        current_monthly_cost: currentMonthlyUSD,
        destination_monthly_cost: destinationMonthly,
        monthly_savings: Math.round(savings),
        annual_savings: Math.round(annualSavings),
        purchasing_power_multiplier: purchasingPowerMultiplier,
        cost_index: destination?.cost_index || null,
        rent_1br: destination?.rent_1br_city_center || null,
        narrative: `Moving to ${destination?.city || city} saves you $${Math.round(savings).toLocaleString()}/month. Your purchasing power is ${purchasingPowerMultiplier}x higher. At this savings rate, you'd add $${Math.round(p3yr - currentNetWorth).toLocaleString()} to your net worth in 3 years.`,
      },
      projection_1yr: Math.round(p1yr),
      projection_3yr: Math.round(p3yr),
      projection_5yr: Math.round(p5yr),
      projection_10yr: Math.round(p10yr),
    };
  }

  private scenarioRelocateCity(profile: any, params: any, currentNetWorth: number) {
    const toState = params.to_state || 'Texas';
    const noIncomeTaxStates = ['Alaska', 'Florida', 'Nevada', 'New Hampshire', 'South Dakota', 'Tennessee', 'Texas', 'Washington', 'Wyoming'];
    const hasNoStateTax = noIncomeTaxStates.some((s) => toState.toLowerCase().includes(s.toLowerCase()));

    const annualIncome = (profile?.annual_income_gross || 0);
    const currentStateRate = 0.05; // ~5% avg state income tax
    const newStateRate = hasNoStateTax ? 0 : 0.03;
    const taxSavingsAnnual = annualIncome * (currentStateRate - newStateRate);
    const taxSavingsMonthly = taxSavingsAnnual / 12;

    const r = 0.08 / 12;
    const p10yr = currentNetWorth + fvAnnuity(taxSavingsMonthly, r, 120);

    return {
      result_summary: {
        destination_state: toState,
        no_state_income_tax: hasNoStateTax,
        annual_tax_savings: Math.round(taxSavingsAnnual),
        monthly_tax_savings: Math.round(taxSavingsMonthly),
        net_worth_impact_10yr: Math.round(p10yr - currentNetWorth),
        narrative: `Moving to ${toState}${hasNoStateTax ? ' (no state income tax)' : ''} saves you $${Math.round(taxSavingsAnnual).toLocaleString()}/yr in taxes. Invested over 10 years at 8%, that's $${Math.round(p10yr - currentNetWorth).toLocaleString()} in additional net worth.`,
      },
      projection_1yr: Math.round(currentNetWorth + taxSavingsMonthly * 12),
      projection_3yr: Math.round(currentNetWorth + fvAnnuity(taxSavingsMonthly, r, 36)),
      projection_5yr: Math.round(currentNetWorth + fvAnnuity(taxSavingsMonthly, r, 60)),
      projection_10yr: Math.round(p10yr),
    };
  }

  private scenarioCutExpense(params: any, currentNetWorth: number) {
    const expenseName = params.expense_name || 'subscription';
    const monthlyAmount = params.monthly_amount || 100;
    const annualSavings = monthlyAmount * 12;

    const r = 0.08 / 12;
    const p10yr = fvAnnuity(monthlyAmount, r, 120);

    return {
      result_summary: {
        expense: expenseName,
        monthly_savings: monthlyAmount,
        annual_savings: annualSavings,
        invested_value_10yr: Math.round(p10yr),
        narrative: `Cutting your $${monthlyAmount}/mo ${expenseName} saves $${annualSavings.toLocaleString()}/yr. Invested at 8% over 10 years: $${Math.round(p10yr).toLocaleString()} in additional net worth.`,
      },
      projection_1yr: Math.round(currentNetWorth + monthlyAmount * 12),
      projection_3yr: Math.round(currentNetWorth + fvAnnuity(monthlyAmount, r, 36)),
      projection_5yr: Math.round(currentNetWorth + fvAnnuity(monthlyAmount, r, 60)),
      projection_10yr: Math.round(currentNetWorth + p10yr),
    };
  }

  private scenarioInvestLumpSum(params: any, currentNetWorth: number) {
    const amount = params.amount || 10000;
    const returnPct = params.return_pct || 8;
    const r = returnPct / 100;

    const fv1yr = fv(amount, r, 1);
    const fv3yr = fv(amount, r, 3);
    const fv5yr = fv(amount, r, 5);
    const fv10yr = fv(amount, r, 10);
    const fv20yr = fv(amount, r, 20);

    return {
      result_summary: {
        investment_amount: amount,
        expected_return_pct: returnPct,
        value_1yr: Math.round(fv1yr),
        value_3yr: Math.round(fv3yr),
        value_5yr: Math.round(fv5yr),
        value_10yr: Math.round(fv10yr),
        value_20yr: Math.round(fv20yr),
        narrative: `Investing $${amount.toLocaleString()} at ${returnPct}% annual return: worth $${Math.round(fv10yr).toLocaleString()} in 10 years and $${Math.round(fv20yr).toLocaleString()} in 20 years. Formula: FV = PV × (1 + r)^n`,
      },
      projection_1yr: Math.round(currentNetWorth + fv1yr - amount),
      projection_3yr: Math.round(currentNetWorth + fv3yr - amount),
      projection_5yr: Math.round(currentNetWorth + fv5yr - amount),
      projection_10yr: Math.round(currentNetWorth + fv10yr - amount),
    };
  }

  private scenarioSellAsset(accounts: any[], params: any, currentNetWorth: number) {
    const accountId = params.account_id;
    const salePrice = params.sale_price || 0;
    const account = accountId ? accounts.find((a) => a.id === accountId) : null;
    const assetValue = account?.balance || salePrice;

    // After selling: invest proceeds at 8%
    const r = 0.08 / 12;
    const investedGrowth = fvAnnuity(0, 0.08 / 12, 120) + fv(assetValue, 0.08, 10);

    return {
      result_summary: {
        asset: account?.name || 'Asset',
        sale_price: assetValue,
        cash_freed: assetValue,
        invested_value_10yr: Math.round(investedGrowth),
        opportunity_cost_holding: Math.round(investedGrowth - assetValue),
        narrative: `Selling ${account?.name || 'this asset'} for $${assetValue.toLocaleString()} and investing proceeds at 8% yields $${Math.round(investedGrowth).toLocaleString()} in 10 years.`,
      },
      projection_1yr: Math.round(currentNetWorth + fv(assetValue, 0.08, 1) - assetValue),
      projection_3yr: Math.round(currentNetWorth + fv(assetValue, 0.08, 3) - assetValue),
      projection_5yr: Math.round(currentNetWorth + fv(assetValue, 0.08, 5) - assetValue),
      projection_10yr: Math.round(currentNetWorth + fv(assetValue, 0.08, 10) - assetValue),
    };
  }

  private scenarioStartBusiness(profile: any, params: any, currentNetWorth: number) {
    const startupCost = params.startup_cost || 5000;
    const monthlyRevenueConservative = params.monthly_revenue_conservative || 500;
    const monthlyRevenueRealistic = params.monthly_revenue_realistic || 2000;
    const monthlyRevenueOptimistic = params.monthly_revenue_optimistic || 5000;
    const monthsToProfit = params.months_to_profitability || 6;

    const breakEvenMonthConservative = Math.ceil(startupCost / monthlyRevenueConservative);
    const breakEvenMonthRealistic = Math.ceil(startupCost / monthlyRevenueRealistic);

    const p3yr_realistic = currentNetWorth - startupCost + fvAnnuity(monthlyRevenueRealistic, 0.01 / 12, 36 - monthsToProfit);
    const p5yr_realistic = currentNetWorth - startupCost + fvAnnuity(monthlyRevenueRealistic, 0.01 / 12, 60 - monthsToProfit);

    return {
      result_summary: {
        startup_cost: startupCost,
        monthly_revenue_scenarios: {
          conservative: monthlyRevenueConservative,
          realistic: monthlyRevenueRealistic,
          optimistic: monthlyRevenueOptimistic,
        },
        break_even_months_conservative: breakEvenMonthConservative,
        break_even_months_realistic: breakEvenMonthRealistic,
        months_to_profitability: monthsToProfit,
        narrative: `Starting this business costs $${startupCost.toLocaleString()}. At the realistic scenario ($${monthlyRevenueRealistic.toLocaleString()}/mo), you break even in ${breakEvenMonthRealistic} months and add $${Math.round(p3yr_realistic - currentNetWorth).toLocaleString()} to your net worth in 3 years.`,
      },
      projection_1yr: Math.round(currentNetWorth - startupCost + fvAnnuity(monthlyRevenueRealistic, 0, Math.max(0, 12 - monthsToProfit))),
      projection_3yr: Math.round(p3yr_realistic),
      projection_5yr: Math.round(p5yr_realistic),
      projection_10yr: Math.round(currentNetWorth - startupCost + fvAnnuity(monthlyRevenueRealistic, 0.01 / 12, 120)),
    };
  }

  private scenarioPayOffDebtEarly(accounts: any[], params: any, currentNetWorth: number) {
    const debtAccounts = accounts.filter((a) => a.is_debt && a.balance > 0);
    const totalDebt = debtAccounts.reduce((s, a) => s + a.balance, 0);
    const totalMinPayments = debtAccounts.reduce((s, a) => s + (a.minimum_payment || 0), 0);
    const targetDate = params.target_date ? new Date(params.target_date) : null;
    const monthsTarget = targetDate
      ? Math.ceil((targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30))
      : 24;

    const requiredMonthlyPayment = totalDebt / monthsTarget;
    const extraPerMonth = Math.max(0, requiredMonthlyPayment - totalMinPayments);

    const totalInterestSaved = debtAccounts.reduce((s, a) => {
      const normal = totalInterestPaid(a.balance, a.apr_percent || 10, a.minimum_payment || 100);
      const fast = totalInterestPaid(a.balance, a.apr_percent || 10, (a.minimum_payment || 100) + extraPerMonth / debtAccounts.length);
      return s + Math.max(0, normal - fast);
    }, 0);

    return {
      result_summary: {
        total_debt: totalDebt,
        target_months: monthsTarget,
        required_monthly_payment: Math.round(requiredMonthlyPayment),
        extra_per_month: Math.round(extraPerMonth),
        total_interest_saved: Math.round(totalInterestSaved),
        debt_free_date: new Date(Date.now() + monthsTarget * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        narrative: `To be debt-free in ${monthsTarget} months, you need to pay $${Math.round(requiredMonthlyPayment).toLocaleString()}/mo total ($${Math.round(extraPerMonth).toLocaleString()} extra). You save $${Math.round(totalInterestSaved).toLocaleString()} in interest.`,
      },
      projection_1yr: Math.round(currentNetWorth + extraPerMonth * 12),
      projection_3yr: Math.round(currentNetWorth + totalDebt),
      projection_5yr: Math.round(currentNetWorth + totalDebt + fvAnnuity(totalMinPayments, 0.08 / 12, 24)),
      projection_10yr: Math.round(currentNetWorth + totalDebt + fvAnnuity(totalMinPayments, 0.08 / 12, 96)),
    };
  }

  private scenarioSalaryNegotiation(profile: any, params: any, currentNetWorth: number) {
    const currentAnnual = profile?.annual_income_gross || 60000;
    const targetAnnual = params.target_annual || currentAnnual * 1.2;
    const probability = params.probability || 2; // 1=likely, 2=possible, 3=longshot
    const probMap = { 1: 0.8, 2: 0.5, 3: 0.2 };
    const successProb = probMap[probability] || 0.5;

    const annualIncrease = targetAnnual - currentAnnual;
    const lifespan = 35; // Working years remaining (approximate)
    const lifetimeEarningsImpact = annualIncrease * lifespan;
    const expectedValue = lifetimeEarningsImpact * successProb;

    const monthlyIncrease = annualIncrease / 12 * (1 - 0.25); // After ~25% tax
    const r = 0.08 / 12;

    return {
      result_summary: {
        current_annual: currentAnnual,
        target_annual: targetAnnual,
        annual_increase: Math.round(annualIncrease),
        lifetime_earnings_impact: Math.round(lifetimeEarningsImpact),
        expected_value: Math.round(expectedValue),
        success_probability_pct: Math.round(successProb * 100),
        narrative: `A successful negotiation to $${targetAnnual.toLocaleString()} adds $${Math.round(annualIncrease).toLocaleString()}/yr. Over a 35-year career, that's $${Math.round(lifetimeEarningsImpact).toLocaleString()} in additional lifetime earnings. The expected value of asking (at ${Math.round(successProb * 100)}% probability) is $${Math.round(expectedValue).toLocaleString()}.`,
      },
      projection_1yr: Math.round(currentNetWorth + monthlyIncrease * 12),
      projection_3yr: Math.round(currentNetWorth + fvAnnuity(monthlyIncrease, r, 36)),
      projection_5yr: Math.round(currentNetWorth + fvAnnuity(monthlyIncrease, r, 60)),
      projection_10yr: Math.round(currentNetWorth + fvAnnuity(monthlyIncrease, r, 120)),
    };
  }

  private scenarioTaxOptimization(profile: any, params: any, currentNetWorth: number) {
    const annualIncome = profile?.annual_income_gross || 60000;
    const filing_status = params.filing_status || 'single';
    const k401_contribution = params.k401_contribution || 23500;
    const ira_contribution = params.ira_contribution || 7000;
    const hsa_contribution = params.hsa_contribution || 0;

    const taxableReduction = k401_contribution + ira_contribution + hsa_contribution;
    const reducedIncome = annualIncome - taxableReduction;

    // Federal marginal rate for ~60k
    const marginalRate = annualIncome > 95000 ? 0.22 : annualIncome > 44725 ? 0.22 : 0.12;
    const estimatedTaxSavings = taxableReduction * marginalRate;
    const monthlyTaxSavings = estimatedTaxSavings / 12;

    const r = 0.08 / 12;

    return {
      result_summary: {
        annual_income: annualIncome,
        taxable_reduction: Math.round(taxableReduction),
        estimated_tax_savings: Math.round(estimatedTaxSavings),
        monthly_tax_savings: Math.round(monthlyTaxSavings),
        marginal_rate_pct: Math.round(marginalRate * 100),
        k401_contribution,
        ira_contribution,
        hsa_contribution,
        narrative: `Maxing your 401k ($${k401_contribution.toLocaleString()}) + IRA ($${ira_contribution.toLocaleString()}) reduces taxable income by $${taxableReduction.toLocaleString()}, saving ~$${Math.round(estimatedTaxSavings).toLocaleString()}/yr in federal taxes (${Math.round(marginalRate * 100)}% bracket). That's $${Math.round(estimatedTaxSavings).toLocaleString()}/yr not leaving your pocket.`,
      },
      projection_1yr: Math.round(currentNetWorth + estimatedTaxSavings),
      projection_3yr: Math.round(currentNetWorth + fvAnnuity(monthlyTaxSavings, r, 36)),
      projection_5yr: Math.round(currentNetWorth + fvAnnuity(monthlyTaxSavings, r, 60)),
      projection_10yr: Math.round(currentNetWorth + fvAnnuity(monthlyTaxSavings, r, 120)),
    };
  }

  private scenarioRetireEarly(profile: any, params: any, currentNetWorth: number) {
    const monthlyNeeded = params.target_monthly_passive || profile?.dream_lifestyle_cost_mo || 5000;
    const returnPct = params.investment_return_pct || 8;
    const annualNeeded = monthlyNeeded * 12;

    // 4% Rule: FI Number = annual needs / 0.04
    const fiNumber = annualNeeded / 0.04;

    const currentSavingsRate = params.current_savings_rate_pct || 15;
    const annualIncome = profile?.annual_income_gross || 60000;
    const annualSavings = annualIncome * (currentSavingsRate / 100);
    const monthlySavings = annualSavings / 12;

    const r = returnPct / 100 / 12;
    const gap = fiNumber - currentNetWorth;

    // Months to FI: solve FV annuity for n given target
    let monthsToFI = 0;
    if (r > 0 && monthlySavings > 0) {
      monthsToFI = Math.log(1 + (gap * r) / monthlySavings) / Math.log(1 + r);
    }

    const yearsToFI = Math.ceil(monthsToFI / 12);
    const currentAge = params.current_age || 30;
    const fiAge = currentAge + yearsToFI;

    // Alternative: 25% savings rate
    const altMonthlySavings = annualIncome * 0.25 / 12;
    let altMonthsToFI = 0;
    if (r > 0 && altMonthlySavings > 0) {
      altMonthsToFI = Math.log(1 + (gap * r) / altMonthlySavings) / Math.log(1 + r);
    }
    const altFIAge = currentAge + Math.ceil(altMonthsToFI / 12);

    return {
      result_summary: {
        monthly_lifestyle_cost: monthlyNeeded,
        fi_number: Math.round(fiNumber),
        current_net_worth: currentNetWorth,
        gap_to_fi: Math.round(fiNumber - currentNetWorth),
        current_savings_rate_pct: currentSavingsRate,
        years_to_fi_at_current_rate: yearsToFI,
        fi_age: fiAge,
        fi_age_at_25pct_savings: altFIAge,
        years_saved_at_25pct: Math.max(0, yearsToFI - (currentAge - altFIAge + currentAge)),
        narrative: `Your FI number is $${Math.round(fiNumber).toLocaleString()} (${monthlyNeeded.toLocaleString()}/mo × 12 / 4%). At your current savings rate, you hit FI at age ${fiAge}. Increase savings to 25% and you reach it at ${altFIAge}. That's ${Math.max(0, fiAge - altFIAge)} years of your life you buy back.`,
      },
      projection_1yr: Math.round(currentNetWorth + fvAnnuity(monthlySavings, r, 12)),
      projection_3yr: Math.round(currentNetWorth + fvAnnuity(monthlySavings, r, 36)),
      projection_5yr: Math.round(currentNetWorth + fvAnnuity(monthlySavings, r, 60)),
      projection_10yr: Math.round(currentNetWorth + fvAnnuity(monthlySavings, r, 120)),
    };
  }

  async getSavedScenarios(userId: string) {
    return this.prisma.whatIfScenario.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
    });
  }

  async saveScenario(userId: string, data: any) {
    return this.prisma.whatIfScenario.create({
      data: {
        user_id: userId,
        scenario_type: data.scenario_type,
        label: data.label,
        parameters: data.parameters,
        result_summary: data.result_summary,
        projection_1yr: data.projection_1yr,
        projection_3yr: data.projection_3yr,
        projection_5yr: data.projection_5yr,
        projection_10yr: data.projection_10yr,
      },
    });
  }

  async deleteScenario(userId: string, scenarioId: string) {
    const scenario = await this.prisma.whatIfScenario.findUnique({ where: { id: scenarioId } });
    if (!scenario) throw new NotFoundException({ error: 'Scenario not found', code: 'NOT_FOUND' });
    if (scenario.user_id !== userId) {
      throw new ForbiddenException({ error: 'Access denied', code: 'FORBIDDEN' });
    }
    await this.prisma.whatIfScenario.delete({ where: { id: scenarioId } });
    return { message: 'Scenario deleted' };
  }
}
