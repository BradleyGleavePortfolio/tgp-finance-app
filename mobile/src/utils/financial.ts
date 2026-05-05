// Client-side financial calculations for The Growth Project: Finance
import type { FinancialAccount, FinancialProfile } from '../types';

// ─── Net Worth ────────────────────────────────────────────────────────────────

export function computeNetWorth(accounts: FinancialAccount[]): {
  netWorth: number;
  totalAssets: number;
  totalDebt: number;
  totalCash: number;
} {
  const active = accounts.filter((a) => a.is_active);
  const totalAssets = active.filter((a) => !a.is_debt).reduce((sum, a) => sum + a.balance, 0);
  const totalDebt = active.filter((a) => a.is_debt).reduce((sum, a) => sum + a.balance, 0);
  const totalCash = active
    .filter((a) => a.account_type === 'checking' || a.account_type === 'savings')
    .reduce((sum, a) => sum + a.balance, 0);

  return {
    netWorth: totalAssets - totalDebt,
    totalAssets,
    totalDebt,
    totalCash,
  };
}

// ─── Interest Bleed ───────────────────────────────────────────────────────────

/**
 * Compute total daily interest cost across all debt accounts
 * Formula: Σ(balance × APR/100 / 365)
 */
export function computeDailyInterest(accounts: FinancialAccount[]): number {
  return accounts
    .filter((a) => a.is_debt && a.apr_percent && a.balance > 0)
    .reduce((sum, a) => sum + (a.balance * (a.apr_percent! / 100)) / 365, 0);
}

export function computeInterestBreakdown(accounts: FinancialAccount[]): Array<{
  account: FinancialAccount;
  daily: number;
  monthly: number;
  annual: number;
}> {
  return accounts
    .filter((a) => a.is_debt && a.apr_percent && a.balance > 0)
    .map((a) => {
      const daily = (a.balance * (a.apr_percent! / 100)) / 365;
      return {
        account: a,
        daily,
        monthly: daily * 30,
        annual: daily * 365,
      };
    });
}

// ─── Debt Payoff ──────────────────────────────────────────────────────────────

/**
 * Standard amortization: months to pay off a debt at minimum payment + extra
 */
export function monthsToPayOff(balance: number, apr: number, monthlyPayment: number): number {
  if (balance <= 0) return 0;
  if (monthlyPayment <= 0) return Infinity;

  const monthlyRate = apr / 100 / 12;
  if (monthlyRate === 0) return Math.ceil(balance / monthlyPayment);

  // Check if payment covers interest
  const monthlyInterest = balance * monthlyRate;
  if (monthlyPayment <= monthlyInterest) return Infinity;

  return Math.ceil(-Math.log(1 - (balance * monthlyRate) / monthlyPayment) / Math.log(1 + monthlyRate));
}

/**
 * Total interest paid over the life of a loan
 */
export function totalInterestPaid(balance: number, apr: number, monthlyPayment: number): number {
  const months = monthsToPayOff(balance, apr, monthlyPayment);
  if (months === Infinity) return Infinity;
  return monthlyPayment * months - balance;
}

/**
 * Avalanche method: sort by APR descending
 */
export function sortByAvalanche(accounts: FinancialAccount[]): FinancialAccount[] {
  return [...accounts].sort((a, b) => (b.apr_percent || 0) - (a.apr_percent || 0));
}

/**
 * Snowball method: sort by balance ascending
 */
export function sortBySnowball(accounts: FinancialAccount[]): FinancialAccount[] {
  return [...accounts].sort((a, b) => a.balance - b.balance);
}

/**
 * Compute debt-free timeline with extra monthly payment
 */
export function debtPayoffProjection(
  debts: FinancialAccount[],
  extraPayment: number,
  method: 'avalanche' | 'snowball'
): {
  monthsToDebtFree: number;
  totalInterestPaid: number;
  totalPaid: number;
} {
  const sorted = method === 'avalanche' ? sortByAvalanche(debts) : sortBySnowball(debts);

  // Simulate month-by-month payoff
  let balances = sorted.map((d) => ({ ...d, currentBalance: d.balance }));
  let monthlyInterestTotal = 0;
  let months = 0;
  let totalInterest = 0;
  const MAX_MONTHS = 600; // 50 years cap

  while (balances.some((b) => b.currentBalance > 0) && months < MAX_MONTHS) {
    months++;
    let availableExtra = extraPayment;

    // Apply minimum payments + accrue interest
    for (const b of balances) {
      if (b.currentBalance <= 0) continue;
      const interest = (b.currentBalance * (b.apr_percent || 0)) / 100 / 12;
      totalInterest += interest;
      b.currentBalance += interest;
      const minPayment = Math.min(b.minimum_payment || 25, b.currentBalance);
      b.currentBalance -= minPayment;
      if (b.currentBalance < 0) b.currentBalance = 0;
    }

    // Apply extra to first non-zero balance (in sorted order)
    for (const b of balances) {
      if (b.currentBalance <= 0 || availableExtra <= 0) continue;
      const payment = Math.min(availableExtra, b.currentBalance);
      b.currentBalance -= payment;
      availableExtra -= payment;
      if (b.currentBalance < 0.01) b.currentBalance = 0;
    }
  }

  const totalPaid = debts.reduce((s, d) => s + (d.minimum_payment || 25) * months, 0) + extraPayment * months;

  return {
    monthsToDebtFree: months >= MAX_MONTHS ? Infinity : months,
    totalInterestPaid: totalInterest,
    totalPaid,
  };
}

// ─── Compound Interest / Projections ─────────────────────────────────────────

/**
 * Future Value: FV = PV × (1+r)^n
 */
export function futureValue(presentValue: number, annualRate: number, years: number): number {
  return presentValue * Math.pow(1 + annualRate / 100, years);
}

/**
 * Future Value of periodic payments (annuity): FV = PMT × ((1+r)^n - 1) / r
 */
export function futureValueAnnuity(monthlyPayment: number, annualRate: number, years: number): number {
  const r = annualRate / 100 / 12;
  const n = years * 12;
  if (r === 0) return monthlyPayment * n;
  return monthlyPayment * (Math.pow(1 + r, n) - 1) / r;
}

/**
 * Net Worth Projection given profile parameters
 */
export function projectNetWorth(
  currentNetWorth: number,
  monthlyIncome: number,
  savingsRatePct: number,
  investmentReturnPct: number,
  incomeGrowthPct: number,
  extraDebtPayment: number,
  years: number
): number[] {
  const dataPoints: number[] = [];
  let netWorth = currentNetWorth;
  let income = monthlyIncome;

  for (let y = 1; y <= years; y++) {
    const monthlySavings = (income * savingsRatePct) / 100;
    const annualSavings = (monthlySavings - extraDebtPayment / 12) * 12;
    netWorth = netWorth * (1 + investmentReturnPct / 100) + annualSavings;
    income *= 1 + incomeGrowthPct / 100;
    dataPoints.push(Math.round(netWorth));
  }

  return dataPoints;
}

// ─── Financial Independence ───────────────────────────────────────────────────

// FI Number: (dream_lifestyle_cost_mo × 12) / 0.04
// Server (backend/src/whatif/whatif.service.ts) is the source of truth and
// applies no inflation buffer. The previous client-side ×1.20 multiplier
// silently diverged from the server, so the same input produced different
// numbers on opposite sides of the wire. Remove it; if an inflation-adjusted
// projection is wanted, surface it as its own field rather than re-pricing
// the headline FI number.
export function computeFINumber(dreamMonthlyExpenses: number): number {
  return (dreamMonthlyExpenses * 12) / 0.04;
}

/**
 * Years to FI at current savings rate
 */
export function yearsToFI(
  currentNetWorth: number,
  fiNumber: number,
  annualSavings: number,
  investmentReturn: number
): number {
  if (currentNetWorth >= fiNumber) return 0;
  const r = investmentReturn / 100;
  // Numerically find years
  let years = 0;
  let nw = currentNetWorth;
  while (nw < fiNumber && years < 100) {
    nw = nw * (1 + r) + annualSavings;
    years++;
  }
  return years;
}

// ─── Wealth Velocity Score ────────────────────────────────────────────────────

export function computeWealthVelocityScore(params: {
  debtPayoffPct90Days: number; // % of high-APR debt paid in 90 days
  netWorthGrowthPct30Days: number; // net worth growth % vs 30 days ago
  currentSavingsRate: number; // %
  targetSavingsRate: number; // % (default 20)
}): number {
  const { debtPayoffPct90Days, netWorthGrowthPct30Days, currentSavingsRate, targetSavingsRate } = params;

  // Doctrine: streak factor removed. Score sums to 100 across debt
  // payoff (35%), net-worth momentum (35%), and savings rate (30%).

  // Debt payoff rate (35%): normalized
  const debtScore = Math.min(35, (Math.min(debtPayoffPct90Days, 10) / 10) * 35);

  // Net worth momentum (35%): positive growth normalized
  const nwScore = Math.min(35, Math.max(0, (netWorthGrowthPct30Days / 5) * 35));

  // Savings rate (30%): ratio vs target
  const savingsScore = Math.min(30, (Math.min(currentSavingsRate / targetSavingsRate, 1)) * 30);

  return Math.round(debtScore + nwScore + savingsScore);
}

export function getVelocityLevel(score: number): { name: string; color: string } {
  if (score <= 15) return { name: 'Starting Line', color: '#8895A7' };
  if (score <= 30) return { name: 'Debt Fighter', color: '#E63946' };
  if (score <= 45) return { name: 'Cash Builder', color: '#F39C12' };
  if (score <= 60) return { name: 'Building Position', color: '#F9C74F' };
  if (score <= 75) return { name: 'Asset Machine', color: '#06D6A0' };
  if (score <= 90) return { name: 'Freedom Tier', color: '#06D6A0' };
  return { name: 'Operator Level', color: '#F9C74F' };
}

// ─── DTI & Savings Rate ───────────────────────────────────────────────────────

/**
 * Debt-to-Income Ratio = total monthly minimums / gross monthly income
 */
export function computeDTI(accounts: FinancialAccount[], monthlyGrossIncome: number): number {
  if (!monthlyGrossIncome) return 0;
  const totalMinimums = accounts
    .filter((a) => a.is_debt && a.minimum_payment)
    .reduce((sum, a) => sum + (a.minimum_payment || 0), 0);
  return (totalMinimums / monthlyGrossIncome) * 100;
}

/**
 * Savings Rate = (take_home - observed expenses) / take_home
 * Returns 0 if no observed expense data is available.
 */
export function computeSavingsRate(takeHomeMonthly: number, observedExpenses?: number): number {
  if (!takeHomeMonthly) return 0;
  if (observedExpenses !== undefined) {
    return Math.max(0, ((takeHomeMonthly - observedExpenses) / takeHomeMonthly) * 100);
  }
  // No data yet — return 0 instead of fake estimate
  return 0;
}

// ─── Tax Burden Estimator ─────────────────────────────────────────────────────

const FEDERAL_BRACKETS_2026 = [
  { min: 0, max: 11925, rate: 0.10 },
  { min: 11925, max: 48475, rate: 0.12 },
  { min: 48475, max: 103350, rate: 0.22 },
  { min: 103350, max: 197300, rate: 0.24 },
  { min: 197300, max: 250525, rate: 0.32 },
  { min: 250525, max: 626350, rate: 0.35 },
  { min: 626350, max: Infinity, rate: 0.37 },
];

const STATE_RATES: Record<string, number> = {
  AL: 5.0, AK: 0, AZ: 2.5, AR: 4.7, CA: 9.3, CO: 4.4, CT: 5.0,
  DE: 5.5, FL: 0, GA: 5.49, HI: 7.25, ID: 5.8, IL: 4.95, IN: 3.15,
  IA: 4.82, KS: 5.7, KY: 4.5, LA: 4.25, ME: 6.75, MD: 5.0, MA: 5.0,
  MI: 4.25, MN: 9.85, MS: 5.0, MO: 4.9, MT: 6.75, NE: 5.84, NV: 0,
  NH: 0, NJ: 6.37, NM: 4.9, NY: 6.85, NC: 5.25, ND: 2.5, OH: 3.99,
  OK: 4.75, OR: 9.9, PA: 3.07, RI: 4.75, SC: 6.5, SD: 0, TN: 0,
  TX: 0, UT: 4.85, VT: 6.6, VA: 5.75, WA: 0, WV: 5.12, WI: 6.27,
  WY: 0, DC: 8.5,
};

export function estimateTaxBurden(annualGross: number, state?: string): {
  federalTax: number;
  stateTax: number;
  totalTax: number;
  effectiveRate: number;
  stateEffectiveRate: number;
  marginalRate: number;
  takeHomeAnnual: number;
  takeHomeMonthly: number;
} {
  // Standard deduction 2026
  const standardDeduction = 15000;
  const taxableIncome = Math.max(0, annualGross - standardDeduction);

  // Federal tax
  let federalTax = 0;
  let marginalRate = 0.10;
  for (const bracket of FEDERAL_BRACKETS_2026) {
    if (taxableIncome <= bracket.min) break;
    const taxableInBracket = Math.min(taxableIncome - bracket.min, bracket.max - bracket.min);
    federalTax += taxableInBracket * bracket.rate;
    if (taxableIncome > bracket.min) marginalRate = bracket.rate;
  }

  // State tax (simplified flat effective rate)
  const stateRate = state ? (STATE_RATES[state.toUpperCase()] || 0) / 100 : 0;
  const stateTax = taxableIncome * stateRate;

  const totalTax = federalTax + stateTax;
  const effectiveRate = annualGross > 0 ? (totalTax / annualGross) * 100 : 0;
  const stateEffectiveRate = annualGross > 0 ? (stateTax / annualGross) * 100 : 0;
  const takeHomeAnnual = annualGross - totalTax;

  return {
    federalTax,
    stateTax,
    totalTax,
    effectiveRate,
    stateEffectiveRate,
    marginalRate: marginalRate * 100,
    takeHomeAnnual,
    takeHomeMonthly: takeHomeAnnual / 12,
  };
}

// ─── Priority Waterfall ───────────────────────────────────────────────────────

export function computePriorityProgress(
  priorityIndex: number,
  accounts: FinancialAccount[],
  profile: Partial<FinancialProfile>
): { target: number; current: number; progressPercent: number; isComplete: boolean } {
  const totalCash = accounts
    .filter((a) => !a.is_debt && (a.account_type === 'checking' || a.account_type === 'savings'))
    .reduce((sum, a) => sum + a.balance, 0);

  const monthlyIncome = profile.monthly_income_gross || 0;

  switch (priorityIndex) {
    case 0: {
      const target = 1000;
      const current = Math.min(totalCash, target);
      return { target, current, progressPercent: (current / target) * 100, isComplete: totalCash >= target };
    }
    case 1: {
      const highAprDebts = accounts.filter((a) => a.is_debt && !a.is_secured && (a.apr_percent || 0) >= 10);
      const totalHighApr = highAprDebts.reduce((s, a) => s + a.balance, 0);
      if (highAprDebts.length === 0) return { target: 0, current: 0, progressPercent: 100, isComplete: true };
      const paid = Math.max(0, (profile.total_debt || 0) - totalHighApr);
      return {
        target: highAprDebts.reduce((s, a) => s + a.balance, 0),
        current: 0,
        progressPercent: totalHighApr <= 0 ? 100 : Math.min(99, Math.max(0, 100 - (totalHighApr / (profile.total_debt || 1)) * 100)),
        isComplete: totalHighApr <= 0,
      };
    }
    case 2: {
      const target = Math.max(monthlyIncome * 0.6 * 3, 10000);
      const current = Math.min(totalCash, target);
      return { target, current, progressPercent: (current / target) * 100, isComplete: totalCash >= target };
    }
    case 3: {
      const target = 23500 + 7000;
      const retirementAccounts = accounts.filter(
        (a) => a.account_type === 'retirement_401k' || a.account_type === 'retirement_ira'
      );
      const current = retirementAccounts.reduce((s, a) => s + a.balance, 0);
      return { target, current, progressPercent: Math.min((current / target) * 100, 100), isComplete: false };
    }
    case 4: {
      const target = Math.max(monthlyIncome * 6, 20000);
      const current = Math.min(totalCash, target);
      return { target, current, progressPercent: (current / target) * 100, isComplete: totalCash >= target };
    }
    case 5: {
      const target = 25000;
      const current = Math.min(totalCash, target);
      return { target, current, progressPercent: (current / target) * 100, isComplete: totalCash >= target };
    }
    default:
      return { target: 0, current: 0, progressPercent: 0, isComplete: false };
  }
}
