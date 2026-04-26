// Constants for The Growth Project: Finance

import type { MilestoneDefinition } from '../types';

// ─── Priority Waterfall Definitions ──────────────────────────────────────────

export const PRIORITY_WATERFALL = [
  {
    index: 0,
    title: 'Build $1,000 Cash Buffer',
    description: 'Your first priority: create a $1,000 emergency buffer in cash. This stops the cycle of putting unexpected expenses on credit.',
    actionItems: [
      'Set aside any extra income toward checking/savings',
      'Cut one non-essential expense this week',
      'Sell unused items for quick cash',
    ],
  },
  {
    index: 1,
    title: 'Eliminate High-APR Debt',
    description: 'Destroy all unsecured debt above 10% APR. This debt costs you more than any investment returns.',
    actionItems: [
      'Pay minimums on all debts',
      'Attack highest APR debt with every extra dollar',
      'Consider balance transfer to lower APR',
    ],
  },
  {
    index: 2,
    title: 'Build 3-Month Emergency Fund',
    description: '3 months of living expenses in cash. This is your financial foundation — it prevents you from ever going back into debt.',
    actionItems: [
      'Automate a monthly transfer to savings',
      'Direct any windfalls here first',
      'Target: $' + '10,000 minimum',
    ],
  },
  {
    index: 3,
    title: 'Invest Tax-Advantaged',
    description: 'Max your 401(k) ($23,500/yr) and Roth IRA ($7,000/yr). These are the highest-return vehicles available.',
    actionItems: [
      'Increase 401(k) contribution to max ($23,500/yr)',
      'Open and fund Roth IRA ($7,000/yr limit)',
      'Capture full employer match immediately',
    ],
  },
  {
    index: 4,
    title: 'Build 6-Month Emergency Fund',
    description: '6 months of complete financial security. With this cushion, you negotiate from strength — not fear.',
    actionItems: [
      'Continue saving beyond 3-month buffer',
      'Keep funds in high-yield savings account',
      'Do not invest this money — liquidity is the point',
    ],
  },
  {
    index: 5,
    title: 'Business Nest Egg Fund',
    description: '$25,000+ dedicated to your business or major opportunity. This is your seed capital for wealth creation.',
    actionItems: [
      'Open a dedicated savings account labeled "Business Fund"',
      'Set a specific business goal and timeline',
      'Research your target opportunity now',
    ],
  },
  {
    index: 6,
    title: 'Asset Building Mode',
    description: 'You\'ve cleared all obstacles. Now build wealth aggressively through index funds, real estate, and income assets.',
    actionItems: [
      'Invest surplus in diversified index funds (VTI, VXUS)',
      'Research real estate opportunities',
      'Build income-generating assets',
    ],
  },
];

// ─── Milestone Definitions ────────────────────────────────────────────────────

export const MILESTONE_DEFINITIONS: MilestoneDefinition[] = [
  // Cash milestones
  { key: 'cash_1k', title: 'Starter Pack Achieved', description: 'First $1,000 in cash', category: 'cash', icon: '·' },
  { key: 'cash_5k', title: 'Buffer Mode', description: '$5,000 in cash', category: 'cash', icon: '·' },
  { key: 'cash_10k', title: 'Cash Stack Building', description: '$10,000 in cash', category: 'cash', icon: '·' },
  { key: 'cash_20k', title: 'Emergency Fund: Complete', description: '$20,000 in cash', category: 'cash', icon: '·' },

  // Debt milestones
  { key: 'first_debt_paid', title: 'First Debt Cleared', description: 'First debt account reaches $0', category: 'debt', icon: '·' },
  { key: 'debt_half', title: 'Halfway There', description: 'Total debt cut in half', category: 'debt', icon: '·' },
  { key: 'debt_zero', title: 'Debt Free', description: 'All debt = $0', category: 'debt', icon: '·' },

  // Net worth milestones
  { key: 'nw_positive', title: 'Into the Black', description: 'Net worth turns positive', category: 'net_worth', icon: '·' },
  { key: 'nw_1k', title: 'First Rung', description: '$1K net worth', category: 'net_worth', icon: '·' },
  { key: 'nw_5k', title: 'Climbing', description: '$5K net worth', category: 'net_worth', icon: '·' },
  { key: 'nw_10k', title: 'Five Figures', description: '$10K net worth', category: 'net_worth', icon: '·' },
  { key: 'nw_25k', title: 'Quarter to Fifty', description: '$25K net worth', category: 'net_worth', icon: '·' },
  { key: 'nw_50k', title: 'Building', description: '$50K net worth', category: 'net_worth', icon: '·' },
  { key: 'nw_100k', title: 'Six Figures', description: '$100K net worth', category: 'net_worth', icon: '·' },
  { key: 'nw_250k', title: 'Quarter Millionaire', description: '$250K net worth', category: 'net_worth', icon: '·' },
  { key: 'nw_500k', title: 'Half Millionaire', description: '$500K net worth', category: 'net_worth', icon: '·' },
  { key: 'nw_1m', title: 'The Million Dollar Moment', description: '$1M net worth', category: 'net_worth', icon: '·' },

  // Streak milestones
  { key: 'streak_7', title: 'Week One', description: '7-day EOD streak', category: 'streak', icon: '·' },
  { key: 'streak_30', title: 'Month One', description: '30-day EOD streak', category: 'streak', icon: '·' },
  { key: 'streak_90', title: 'Day 90', description: '90-day EOD streak', category: 'streak', icon: '·' },
  { key: 'streak_365', title: 'Year One', description: '365-day EOD streak', category: 'streak', icon: '·' },

  // Income milestones
  { key: 'income_100k', title: 'Six-Figure Earner', description: 'Annual income hits $100K', category: 'income', icon: '·' },
  { key: 'income_200k', title: 'Top Five Percent', description: 'Annual income $200K', category: 'income', icon: '·' },
];

// ─── Daily Habits ─────────────────────────────────────────────────────────────

export const DAILY_HABITS = [
  { key: 'no_impulse_buy', label: 'No impulse purchase today' },
  { key: 'checked_balances', label: 'Reviewed all account balances' },
  { key: 'said_no_expense', label: 'Said no to an unnecessary expense' },
  { key: 'savings_goal', label: 'Put something toward a savings goal' },
  { key: 'logged_accurately', label: 'Logged income/expenses accurately' },
];

// ─── What-If Scenario Definitions ────────────────────────────────────────────

export const WHATIF_SCENARIOS = [
  {
    type: 'extra_debt_payment',
    title: 'Extra Debt Payment',
    description: 'See how extra monthly payments accelerate your debt payoff',
    icon: '→',
  },
  {
    type: 'income_increase',
    title: 'Income Increase',
    description: 'Model a raise or new income source',
    icon: '→',
  },
  {
    type: 'relocate_country',
    title: 'Relocate to Another Country',
    description: 'Geo-arbitrage: earn USD, spend less',
    icon: '→',
  },
  {
    type: 'relocate_city',
    title: 'Relocate Within the US',
    description: 'Move to a no-income-tax state',
    icon: '→',
  },
  {
    type: 'cut_expense',
    title: 'Cut a Recurring Expense',
    description: 'See the long-term impact of cutting monthly costs',
    icon: '→',
  },
  {
    type: 'invest_lump_sum',
    title: 'Invest a Lump Sum',
    description: 'Model compound growth on a one-time investment',
    icon: '→',
  },
  {
    type: 'sell_asset',
    title: 'Pay Off Debt Completely',
    description: 'Clear a specific debt and see the cash flow freed',
    icon: '→',
  },
  {
    type: 'salary_negotiation',
    title: 'Negotiate a Raise',
    description: 'Quantify the lifetime value of asking for more',
    icon: '→',
  },
  {
    type: 'start_business',
    title: 'Start a Side Business',
    description: 'Model revenue scenarios and break-even timeline',
    icon: '→',
  },
  {
    type: 'pay_off_debt_early',
    title: 'Early Debt-Free Day',
    description: 'Set a target date — see what it takes',
    icon: '→',
  },
  {
    type: 'tax_optimization',
    title: 'Tax Optimization',
    description: 'Reduce your tax bill with 401k, HSA, deductions',
    icon: '→',
  },
  {
    type: 'retire_early',
    title: 'Financial Independence',
    description: 'When can you retire early? Model your FI number',
    icon: '→',
  },
];

// ─── Quick Suggestion Prompts ─────────────────────────────────────────────────

export const CHAT_QUICK_SUGGESTIONS = [
  'Am I on track toward my goal?',
  "What's my next move?",
  'Run a What-If scenario',
  'How do I pay off debt faster?',
  "What's the 4% rule?",
  'Should I invest or pay debt?',
  'Explain geo-arbitrage',
  'How do I build an emergency fund?',
];

// ─── Account Type Labels ──────────────────────────────────────────────────────

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  checking: 'Checking',
  savings: 'Savings',
  investment_brokerage: 'Brokerage',
  retirement_401k: '401(k)',
  retirement_ira: 'IRA',
  real_estate: 'Real Estate',
  vehicle: 'Vehicle',
  other_asset: 'Other Asset',
  credit_card: 'Credit Card',
  personal_loan: 'Personal Loan',
  student_loan: 'Student Loan',
  auto_loan: 'Auto Loan',
  mortgage: 'Mortgage',
  medical_debt: 'Medical Debt',
  other_debt: 'Other Debt',
};

// ─── API Base URL ─────────────────────────────────────────────────────────────

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://tgp-finance-api.fly.dev';

// ─── Mood Emojis ──────────────────────────────────────────────────────────────

export const MOOD_EMOJIS = ['1', '2', '3', '4', '5'];  // luxury/wave1: emoji removed, use numeric labels
export const MOOD_LABELS = ['Stressed', 'Neutral', 'Okay', 'Good', 'Strong'];
