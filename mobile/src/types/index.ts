// The Growth Project: Finance — All TypeScript Interfaces

// ─── Enums ───────────────────────────────────────────────────────────────────

export type Role = 'coach' | 'student';

export type AccountType =
  | 'checking'
  | 'savings'
  | 'investment_brokerage'
  | 'retirement_401k'
  | 'retirement_ira'
  | 'real_estate'
  | 'vehicle'
  | 'other_asset'
  | 'credit_card'
  | 'personal_loan'
  | 'student_loan'
  | 'auto_loan'
  | 'mortgage'
  | 'medical_debt'
  | 'other_debt';

export type RiskTolerance = 'conservative' | 'moderate' | 'aggressive';
export type MotivationStyle = 'small_wins' | 'big_picture';
export type LogSource = 'eod_form' | 'manual_update' | 'onboarding';

export type ScenarioType =
  | 'extra_debt_payment'
  | 'income_increase'
  | 'relocate_country'
  | 'relocate_city'
  | 'cut_expense'
  | 'invest_lump_sum'
  | 'sell_asset'
  | 'start_business'
  | 'pay_off_debt_early'
  | 'salary_negotiation'
  | 'tax_optimization'
  | 'retire_early';

// ─── User & Profile ───────────────────────────────────────────────────────────

export interface User {
  id: string;
  supabase_id: string;
  email: string;
  name: string;
  phone?: string;
  referral_code?: string;
  role: Role;
  coach_id?: string;
  created_at: string;
  accountability_pair?: string;
}

export interface FinancialProfile {
  id: string;
  user_id: string;
  state?: string;
  city?: string;
  country: string;
  monthly_income_gross?: number;
  annual_income_gross?: number;
  income_sources?: IncomeSource[];
  primary_goal?: string;
  goal_timeline_months?: number;
  dream_lifestyle_cost_mo?: number;
  dream_description?: string;
  risk_tolerance: RiskTolerance;
  is_self_employed: boolean;
  has_business: boolean;
  motivation_style: MotivationStyle;
  net_worth_snapshot?: number;
  total_debt?: number;
  total_assets?: number;
  total_cash?: number;
  current_priority_index: number;
  wealth_velocity_score?: number;
  streak_days: number;
  last_eod_date?: string;
  future_self_letter?: string;
  updated_at: string;
}

export interface IncomeSource {
  source: string;
  amount: number;
  frequency: 'monthly' | 'weekly' | 'annual' | 'one_time';
}

// ─── Financial Accounts ───────────────────────────────────────────────────────

export interface FinancialAccount {
  id: string;
  user_id: string;
  name: string;
  account_type: AccountType;
  institution?: string;
  balance: number;
  is_debt: boolean;
  apr_percent?: number;
  is_secured?: boolean;
  minimum_payment?: number;
  currency: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
  balance_logs?: AccountBalanceLog[];
}

export interface AccountBalanceLog {
  id: string;
  account_id: string;
  balance: number;
  date: string;
  logged_at: string;
  source: LogSource;
}

// ─── EOD Submissions ─────────────────────────────────────────────────────────

export interface EODSubmission {
  id: string;
  user_id: string;
  submission_date: string;
  account_snapshots: AccountSnapshot[];
  net_worth_computed: number;
  total_debt_computed: number;
  total_assets_computed: number;
  total_cash_computed: number;
  notes?: string;
  mood?: number;
  ai_insight?: string;
  habits?: HabitEntry[];
  submitted_at: string;
}

export interface AccountSnapshot {
  account_id: string;
  balance: number;
  notes?: string;
}

export interface HabitEntry {
  habit_key: string;
  completed: boolean;
}

// ─── Net Worth ────────────────────────────────────────────────────────────────

export interface NetWorthHistory {
  date: string;
  net_worth: number;
  total_assets: number;
  total_debt: number;
}

// ─── Priority Waterfall ───────────────────────────────────────────────────────

export interface Priority {
  index: number;
  title: string;
  description: string;
  actionItems: string[];
  target?: number;
  current?: number;
  isComplete: boolean;
  estimatedCompletionDate?: string;
  progressPercent?: number;
}

// ─── What-If Scenarios ────────────────────────────────────────────────────────

export interface WhatIfScenario {
  id: string;
  user_id: string;
  scenario_type: ScenarioType;
  label: string;
  parameters: Record<string, unknown>;
  result_summary: ScenarioResult;
  projection_1yr?: number;
  projection_3yr?: number;
  projection_5yr?: number;
  projection_10yr?: number;
  created_at: string;
}

export interface ScenarioResult {
  headline: string;
  narrative: string;
  keyMetrics: Array<{ label: string; value: string; positive?: boolean }>;
  monthsToGoalChange?: number;
  annualSavings?: number;
  netWorthImpact10yr?: number;
}

// ─── Milestones ───────────────────────────────────────────────────────────────

export interface MilestoneUnlock {
  id: string;
  user_id: string;
  milestone_key: string;
  unlocked_at: string;
  celebrated: boolean;
}

export interface MilestoneDefinition {
  key: string;
  title: string;
  description: string;
  category: 'cash' | 'debt' | 'net_worth' | 'streak' | 'income';
  icon: string;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export interface NotificationPreferences {
  id: string;
  user_id: string;
  eod_reminder_enabled: boolean;
  eod_reminder_time: string;
  streak_alerts_enabled: boolean;
  milestone_alerts: boolean;
  coach_messages: boolean;
  red_flag_alerts: boolean;
  future_self_letter_enabled: boolean;
  priority_levelup_alerts: boolean;
  spending_dna_alerts: boolean;
  timezone: string;
}

// ─── Habit Logs ───────────────────────────────────────────────────────────────

export interface HabitLog {
  id: string;
  user_id: string;
  habit_key: string;
  date: string;
  completed: boolean;
  logged_at: string;
}

// ─── Coach Types ──────────────────────────────────────────────────────────────

export interface CoachNote {
  id: string;
  coach_id: string;
  student_id: string;
  note: string;
  is_private: boolean;
  created_at: string;
}

export interface ProgramTemplate {
  id: string;
  coach_id: string;
  name: string;
  description?: string;
  phases: ProgramPhase[];
  created_at: string;
}

export interface ProgramPhase {
  phase_name: string;
  priority_index: number;
  duration_weeks: number;
  notes: string;
}

export interface CoachStudentSummary {
  user: User;
  profile: FinancialProfile;
  submitted_today: boolean;
  last_submission?: string;
  red_flags: RedFlag[];
}

export interface RedFlag {
  type: 'streak_broken' | 'net_worth_declining' | 'credit_spike';
  message: string;
  severity: 'low' | 'medium' | 'high';
  created_at: string;
}

export interface CoachAlert {
  student_id: string;
  student_name: string;
  type: string;
  message: string;
  days_since_submission?: number;
  created_at: string;
}

// ─── AI Chat ──────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// ─── Projections ─────────────────────────────────────────────────────────────

export interface ProjectionParams {
  income_growth_pct: number;
  savings_rate_pct: number;
  investment_return_pct: number;
  extra_debt_payment: number;
}

export interface ProjectionResult {
  year_1: number;
  year_3: number;
  year_5: number;
  year_10: number;
  year_20: number;
  debt_free_months?: number;
  fi_date?: string;
  dataPoints: Array<{ year: number; value: number }>;
}

// ─── Cost of Living ───────────────────────────────────────────────────────────

export interface CostOfLivingData {
  country: string;
  city?: string;
  monthly_cost_usd: number;
  rent_usd: number;
  food_usd: number;
  transport_usd: number;
  utilities_usd: number;
  entertainment_usd: number;
  cost_index: number; // relative to NYC = 100
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthState {
  user: User | null;
  profile: FinancialProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasCompletedOnboarding: boolean;
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  code: string;
  statusCode: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// ─── Onboarding ───────────────────────────────────────────────────────────────

export interface OnboardingData {
  // Phase 1 - Income
  monthly_income_gross?: number;
  income_sources?: IncomeSource[];
  is_self_employed?: boolean;
  has_business?: boolean;

  // Phase 2 - Assets (accounts to create)
  checking_accounts?: Array<{ name: string; balance: number }>;
  savings_accounts?: Array<{ name: string; balance: number }>;
  investment_accounts?: Array<{ name: string; type: AccountType; balance: number }>;
  real_estate?: Array<{ name: string; value: number }>;
  vehicles?: Array<{ name: string; value: number }>;

  // Phase 3 - Debts
  credit_cards?: Array<{ name: string; balance: number; apr: number; minimum_payment: number }>;
  loans?: Array<{ name: string; type: AccountType; balance: number; apr: number; minimum_payment: number }>;
  mortgage?: { property_value: number; balance: number; apr: number; monthly_payment: number };

  // Phase 4 - Location
  country?: string;
  state?: string;
  city?: string;

  // Phase 5 - Goals
  primary_goal?: string;
  goal_timeline_months?: number;
  dream_description?: string;
  dream_lifestyle_cost_mo?: number;
  motivation_style?: MotivationStyle;

  // Future Self Letter
  future_self_letter?: string;
}

// ─── Spending DNA ─────────────────────────────────────────────────────────────

export interface SpendingDNAReport {
  id: string;
  user_id: string;
  month: string; // YYYY-MM
  paragraph_pattern: string;
  paragraph_leak: string;
  paragraph_action: string;
  avg_daily_card_spend: number;
  savings_rate_pct: number;
  biggest_leak_account?: string;
  created_at: string;
}
