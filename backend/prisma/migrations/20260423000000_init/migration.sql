-- CreateEnum
CREATE TYPE "Role" AS ENUM ('coach', 'student');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('checking', 'savings', 'investment_brokerage', 'retirement_401k', 'retirement_ira', 'real_estate', 'vehicle', 'other_asset', 'credit_card', 'personal_loan', 'student_loan', 'auto_loan', 'mortgage', 'medical_debt', 'other_debt');

-- CreateEnum
CREATE TYPE "RiskTolerance" AS ENUM ('conservative', 'moderate', 'aggressive');

-- CreateEnum
CREATE TYPE "MotivationStyle" AS ENUM ('small_wins', 'big_picture');

-- CreateEnum
CREATE TYPE "LogSource" AS ENUM ('eod_form', 'manual_update', 'onboarding');

-- CreateEnum
CREATE TYPE "ScenarioType" AS ENUM ('extra_debt_payment', 'income_increase', 'relocate_country', 'relocate_city', 'cut_expense', 'invest_lump_sum', 'sell_asset', 'start_business', 'pay_off_debt_early', 'salary_negotiation', 'tax_optimization', 'retire_early');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "supabase_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "referral_code" TEXT,
    "role" "Role" NOT NULL DEFAULT 'student',
    "coach_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountability_pair" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "state" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'United States',
    "monthly_income_gross" DOUBLE PRECISION,
    "annual_income_gross" DOUBLE PRECISION,
    "income_sources" JSONB,
    "primary_goal" TEXT,
    "goal_timeline_months" INTEGER,
    "dream_lifestyle_cost_mo" DOUBLE PRECISION,
    "dream_description" TEXT,
    "future_self_letter" TEXT,
    "risk_tolerance" "RiskTolerance" NOT NULL DEFAULT 'moderate',
    "is_self_employed" BOOLEAN NOT NULL DEFAULT false,
    "has_business" BOOLEAN NOT NULL DEFAULT false,
    "motivation_style" "MotivationStyle" NOT NULL DEFAULT 'big_picture',
    "net_worth_snapshot" DOUBLE PRECISION,
    "total_debt" DOUBLE PRECISION,
    "total_assets" DOUBLE PRECISION,
    "total_cash" DOUBLE PRECISION,
    "current_priority_index" INTEGER NOT NULL DEFAULT 0,
    "wealth_velocity_score" DOUBLE PRECISION,
    "streak_days" INTEGER NOT NULL DEFAULT 0,
    "last_eod_date" TIMESTAMP(3),
    "filing_status" TEXT NOT NULL DEFAULT 'single',
    "onboarding_complete" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "account_type" "AccountType" NOT NULL,
    "institution" TEXT,
    "balance" DOUBLE PRECISION NOT NULL,
    "is_debt" BOOLEAN NOT NULL DEFAULT false,
    "apr_percent" DOUBLE PRECISION,
    "is_secured" BOOLEAN,
    "minimum_payment" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_balance_logs" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL,
    "date" DATE NOT NULL,
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "LogSource" NOT NULL DEFAULT 'eod_form',

    CONSTRAINT "account_balance_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eod_submissions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "submission_date" DATE NOT NULL,
    "account_snapshots" JSONB NOT NULL,
    "net_worth_computed" DOUBLE PRECISION NOT NULL,
    "total_debt_computed" DOUBLE PRECISION NOT NULL,
    "total_assets_computed" DOUBLE PRECISION NOT NULL,
    "total_cash_computed" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "mood" INTEGER,
    "ai_insight" TEXT,
    "habits_checked" JSONB,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eod_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "what_if_scenarios" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "scenario_type" "ScenarioType" NOT NULL,
    "label" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "result_summary" JSONB NOT NULL,
    "projection_1yr" DOUBLE PRECISION,
    "projection_3yr" DOUBLE PRECISION,
    "projection_5yr" DOUBLE PRECISION,
    "projection_10yr" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "what_if_scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestone_unlocks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "milestone_key" TEXT NOT NULL,
    "unlocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "celebrated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "milestone_unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "eod_reminder_enabled" BOOLEAN NOT NULL DEFAULT true,
    "eod_reminder_time" TEXT NOT NULL DEFAULT '20:00',
    "streak_alerts_enabled" BOOLEAN NOT NULL DEFAULT true,
    "milestone_alerts" BOOLEAN NOT NULL DEFAULT true,
    "coach_messages" BOOLEAN NOT NULL DEFAULT true,
    "red_flag_alerts" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "expo_push_token" TEXT,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "habit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "habit_key" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT true,
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "habit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_notes" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "is_private" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_templates" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "phases" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "program_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spending_dna_reports" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "report_text" TEXT NOT NULL,
    "key_metrics" JSONB NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spending_dna_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_supabase_id_key" ON "users"("supabase_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "financial_profiles_user_id_key" ON "financial_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "eod_submissions_user_id_submission_date_key" ON "eod_submissions"("user_id", "submission_date");

-- CreateIndex
CREATE UNIQUE INDEX "milestone_unlocks_user_id_milestone_key_key" ON "milestone_unlocks"("user_id", "milestone_key");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_key" ON "notification_preferences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "habit_logs_user_id_habit_key_date_key" ON "habit_logs"("user_id", "habit_key", "date");

-- CreateIndex
CREATE UNIQUE INDEX "spending_dna_reports_user_id_month_key" ON "spending_dna_reports"("user_id", "month");

-- AddForeignKey
ALTER TABLE "financial_profiles" ADD CONSTRAINT "financial_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_balance_logs" ADD CONSTRAINT "account_balance_logs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "financial_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eod_submissions" ADD CONSTRAINT "eod_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "what_if_scenarios" ADD CONSTRAINT "what_if_scenarios_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone_unlocks" ADD CONSTRAINT "milestone_unlocks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habit_logs" ADD CONSTRAINT "habit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_notes" ADD CONSTRAINT "coach_notes_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_notes" ADD CONSTRAINT "coach_notes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_templates" ADD CONSTRAINT "program_templates_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

