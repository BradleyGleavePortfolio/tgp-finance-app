import { z } from 'zod';
import {
  MoneyAmount,
  MoneyAmountAny,
  MoneyAmountNonNegative,
  MoneyAmountPositive,
} from '../zod/money';

// Re-export so consumers can pull MoneyAmount* from the same place as the
// other API schemas. The canonical definition lives in common/zod/money.ts.
export {
  MoneyAmount,
  MoneyAmountAny,
  MoneyAmountNonNegative,
  MoneyAmountPositive,
} from '../zod/money';
export type { MoneyAmount as MoneyAmountType } from '../zod/money';

// ============================================================
// AUTH SCHEMAS
// ============================================================

export const RegisterSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character'),
  name: z.string().min(1, 'Name is required').max(100),
  phone: z.string().optional(),
  referral_code: z.string().optional(),
  // Phase 1C: client signups must travel via a coach. Optional at the schema
  // level so existing clients still work; the auth service decides whether
  // the code is REQUIRED based on FEATURE_REQUIRE_COACH_CODE.
  invite_code: z.string().min(1).max(64).optional(),
});

export const LoginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const GoogleAuthSchema = z.object({
  access_token: z.string(),
  id_token: z.string().optional(),
});

export const SelectRoleSchema = z.object({
  role: z.enum(['coach', 'student']),
  coach_access_code: z.string().optional(),
});

export const VerifyEmailSchema = z.object({
  token: z.string().min(1),
  type: z.string().optional(),
});

// ============================================================
// PROFILE SCHEMAS
// ============================================================

const IncomeSourceSchema = z.object({
  source: z.string(),
  amount: MoneyAmountPositive(),
  frequency: z.enum(['monthly', 'weekly', 'annual', 'one_time']),
});

export const UpdateProfileSchema = z.object({
  state: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  monthly_income_gross: MoneyAmountPositive().optional(),
  annual_income_gross: MoneyAmountPositive().optional(),
  income_sources: z.array(IncomeSourceSchema).optional(),
  primary_goal: z.string().optional(),
  goal_timeline_months: z.number().int().positive().optional(),
  dream_lifestyle_cost_mo: MoneyAmountPositive().optional(),
  dream_description: z.string().optional(),
  future_self_letter: z.string().optional(),
  risk_tolerance: z.enum(['conservative', 'moderate', 'aggressive']).optional(),
  is_self_employed: z.boolean().optional(),
  has_business: z.boolean().optional(),
  motivation_style: z.enum(['small_wins', 'big_picture']).optional(),
  filing_status: z.string().optional(),
});

// ============================================================
// ACCOUNT SCHEMAS
// ============================================================

export const CreateAccountSchema = z.object({
  name: z.string().min(1).max(100),
  account_type: z.enum([
    'checking', 'savings', 'investment_brokerage', 'retirement_401k',
    'retirement_ira', 'real_estate', 'vehicle', 'other_asset',
    'credit_card', 'personal_loan', 'student_loan', 'auto_loan',
    'mortgage', 'medical_debt', 'other_debt',
  ]),
  institution: z.string().optional(),
  // Balances may be 0 (new account) or even negative (overdrawn checking).
  balance: MoneyAmountAny(),
  is_debt: z.boolean().optional(),
  apr_percent: z.number().min(0).max(100).optional(),
  is_secured: z.boolean().optional(),
  minimum_payment: MoneyAmountNonNegative().optional(),
  currency: z.string().default('USD'),
  notes: z.string().optional(),
});

export const UpdateAccountSchema = CreateAccountSchema.partial();

// ============================================================
// EOD SCHEMAS
// ============================================================

const AccountSnapshotSchema = z.object({
  account_id: z.string().uuid(),
  // Asset balances can swing negative (overdraft) so we accept any sign.
  balance: MoneyAmountAny(),
  notes: z.string().optional(),
});

export const SubmitEODSchema = z.object({
  submission_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  account_snapshots: z.array(AccountSnapshotSchema).min(1, 'At least one account snapshot required'),
  notes: z.string().optional(),
  mood: z.number().int().min(1).max(5).optional(),
  habits_checked: z.array(z.string()).optional(),
});

// ============================================================
// WHAT-IF SCHEMAS
// ============================================================

export const RunWhatIfSchema = z.object({
  scenario_type: z.enum([
    'extra_debt_payment', 'income_increase', 'relocate_country', 'relocate_city',
    'cut_expense', 'invest_lump_sum', 'sell_asset', 'start_business',
    'pay_off_debt_early', 'salary_negotiation', 'tax_optimization', 'retire_early',
  ]),
  parameters: z.record(z.any()),
  label: z.string().optional(),
});

export const SaveWhatIfSchema = z.object({
  scenario_type: z.enum([
    'extra_debt_payment', 'income_increase', 'relocate_country', 'relocate_city',
    'cut_expense', 'invest_lump_sum', 'sell_asset', 'start_business',
    'pay_off_debt_early', 'salary_negotiation', 'tax_optimization', 'retire_early',
  ]),
  label: z.string().min(1).max(100),
  parameters: z.record(z.any()),
  result_summary: z.record(z.any()),
  projection_1yr: z.number().optional(),
  projection_3yr: z.number().optional(),
  projection_5yr: z.number().optional(),
  projection_10yr: z.number().optional(),
});

// ============================================================
// PROJECTIONS SCHEMAS
// ============================================================

export const RunProjectionSchema = z.object({
  income_growth_pct: z.number().min(0).max(50).default(5),
  savings_rate_pct: z.number().min(0).max(100),
  investment_return_pct: z.number().min(0).max(20).default(8),
  extra_debt_payment: z.number().min(0).default(0),
  years: z.number().int().min(1).max(30).default(10),
});

// ============================================================
// NOTIFICATION SCHEMAS
// ============================================================

export const UpdateNotificationPrefsSchema = z.object({
  eod_reminder_enabled: z.boolean().optional(),
  eod_reminder_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  milestone_alerts: z.boolean().optional(),
  coach_messages: z.boolean().optional(),
  red_flag_alerts: z.boolean().optional(),
  future_self_letter_enabled: z.boolean().optional(),
  priority_levelup_alerts: z.boolean().optional(),
  spending_dna_alerts: z.boolean().optional(),
  timezone: z.string().optional(),
  expo_push_token: z.string().optional(),
});

// ============================================================
// COACH SCHEMAS
// ============================================================

export const CreateCoachNoteSchema = z.object({
  note: z.string().min(1).max(2000),
  is_private: z.boolean().default(false),
});

export const CreateProgramTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  phases: z.array(z.object({
    phase_name: z.string(),
    priority_index: z.number().int().min(0).max(6),
    duration_weeks: z.number().int().positive(),
    notes: z.string().optional(),
  })),
});

// Stage 2 — Coach Operating System validators

export const CreateAssignmentSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  assignment_type: z
    .enum(['budget', 'savings_challenge', 'debt_paydown', 'habit', 'custom'])
    .default('custom'),
  due_date: z.string().datetime().optional(),
  target_value: MoneyAmountNonNegative().optional(),
  target_unit: z.string().max(20).optional(),
  coach_notes: z.string().max(2000).optional(),
});

export const UpdateAssignmentSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  assignment_type: z
    .enum(['budget', 'savings_challenge', 'debt_paydown', 'habit', 'custom'])
    .optional(),
  due_date: z.string().datetime().nullable().optional(),
  status: z.enum(['open', 'completed', 'dismissed']).optional(),
  target_value: MoneyAmountNonNegative().nullable().optional(),
  target_unit: z.string().max(20).nullable().optional(),
  coach_notes: z.string().max(2000).nullable().optional(),
});

export const SendCoachMessageSchema = z.object({
  body: z.string().min(1).max(4000),
});

export const CreateCommunityPostSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(8000),
  resource_url: z.string().url().max(500).optional(),
  status: z.enum(['draft', 'published', 'archived']).default('published'),
  audience: z.enum(['own_clients', 'all_clients']).default('own_clients'),
});

export const UpdateCommunityPostSchema = CreateCommunityPostSchema.partial();

// ============================================================
// ACCOUNTABILITY SCHEMAS
// ============================================================

export const PairAccountabilitySchema = z.object({
  student_id_1: z.string().uuid(),
  student_id_2: z.string().uuid(),
});

// ============================================================
// ONBOARDING SCHEMAS
// ============================================================

export const SubmitQuizSchema = z.object({
  answers: z.object({
    risk_tolerance: z.string().min(1, 'Risk tolerance is required'),
    investment_horizon: z.string().min(1, 'Investment horizon is required'),
    financial_goal: z.string().min(1, 'Financial goal is required'),
    income_range: z.string().min(1, 'Income range is required'),
    // Money fields arrive as strings from the mobile quiz form. They are
    // optional, but when present they must be valid money — funnel through
    // MoneyAmount so we never silently accept "abc" or "1.234".
    monthly_take_home: MoneyAmountPositive().optional(),
    monthly_dream_cost: MoneyAmountPositive().optional(),
    future_self_letter: z.string().optional(),
    dream_description: z.string().optional(),
  }),
});

// ============================================================
// PAYDAY SCHEMAS
// ============================================================
//
// Lives here (rather than payday/payday.controller.ts) so every money
// surface is auditable from a single file. The controller imports from
// here.

const PaydayAllocationSchema = z.object({
  account_id: z.string().uuid('account_id must be a valid UUID'),
  amount: MoneyAmountPositive(),
  percentage: z.number().min(0).max(100).optional(),
});

export const DeployPaycheckSchema = z.object({
  paycheck_amount: MoneyAmountPositive(),
  allocations: z
    .array(PaydayAllocationSchema)
    .min(1, 'At least one allocation is required'),
});

export const SavePaydayTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  allocations: z
    .array(
      z.object({
        account_id: z.string().uuid(),
        percentage: z.number().min(0).max(100),
      }),
    )
    .min(1),
});

// ============================================================
// AI SCHEMAS
// ============================================================

// SECURITY: `role` previously allowed 'system', which let a client inject a fake system
// message into the conversation history and override the server-owned system prompt (prompt
// injection). The server always owns the system role; clients may only send user/assistant.
const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

export const AIChatSchema = z.object({
  message: z.string().min(1).max(2000),
  conversation_history: z.array(MessageSchema).default([]),
});

export const EODInsightSchema = z.object({
  eod_submission_id: z.string().uuid(),
});

export const SpendingDnaSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be YYYY-MM format'),
});
