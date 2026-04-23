-- Convert money fields from DOUBLE PRECISION (Float) to DECIMAL(14, 2)
-- Rationale: IEEE-754 rounding errors accumulate across cents. DECIMAL is lossless.
-- 14 total digits / 2 fractional = max ~$99 trillion — well within safe JS Number range,
-- so a response interceptor can safely serialize as Number to preserve API shape.
-- Cast is lossy-safe (values currently in Float fit within DECIMAL(14, 2) easily).

-- financial_profiles
ALTER TABLE "financial_profiles"
  ALTER COLUMN "monthly_income_gross"    TYPE DECIMAL(14, 2) USING "monthly_income_gross"::DECIMAL(14, 2),
  ALTER COLUMN "annual_income_gross"     TYPE DECIMAL(14, 2) USING "annual_income_gross"::DECIMAL(14, 2),
  ALTER COLUMN "dream_lifestyle_cost_mo" TYPE DECIMAL(14, 2) USING "dream_lifestyle_cost_mo"::DECIMAL(14, 2),
  ALTER COLUMN "net_worth_snapshot"      TYPE DECIMAL(14, 2) USING "net_worth_snapshot"::DECIMAL(14, 2),
  ALTER COLUMN "total_debt"              TYPE DECIMAL(14, 2) USING "total_debt"::DECIMAL(14, 2),
  ALTER COLUMN "total_assets"            TYPE DECIMAL(14, 2) USING "total_assets"::DECIMAL(14, 2),
  ALTER COLUMN "total_cash"              TYPE DECIMAL(14, 2) USING "total_cash"::DECIMAL(14, 2);

-- financial_accounts
ALTER TABLE "financial_accounts"
  ALTER COLUMN "balance"         TYPE DECIMAL(14, 2) USING "balance"::DECIMAL(14, 2),
  ALTER COLUMN "minimum_payment" TYPE DECIMAL(14, 2) USING "minimum_payment"::DECIMAL(14, 2);

-- account_balance_logs
ALTER TABLE "account_balance_logs"
  ALTER COLUMN "balance" TYPE DECIMAL(14, 2) USING "balance"::DECIMAL(14, 2);

-- eod_submissions
ALTER TABLE "eod_submissions"
  ALTER COLUMN "net_worth_computed"    TYPE DECIMAL(14, 2) USING "net_worth_computed"::DECIMAL(14, 2),
  ALTER COLUMN "total_debt_computed"   TYPE DECIMAL(14, 2) USING "total_debt_computed"::DECIMAL(14, 2),
  ALTER COLUMN "total_assets_computed" TYPE DECIMAL(14, 2) USING "total_assets_computed"::DECIMAL(14, 2),
  ALTER COLUMN "total_cash_computed"   TYPE DECIMAL(14, 2) USING "total_cash_computed"::DECIMAL(14, 2);

-- what_if_scenarios
ALTER TABLE "what_if_scenarios"
  ALTER COLUMN "projection_1yr"  TYPE DECIMAL(14, 2) USING "projection_1yr"::DECIMAL(14, 2),
  ALTER COLUMN "projection_3yr"  TYPE DECIMAL(14, 2) USING "projection_3yr"::DECIMAL(14, 2),
  ALTER COLUMN "projection_5yr"  TYPE DECIMAL(14, 2) USING "projection_5yr"::DECIMAL(14, 2),
  ALTER COLUMN "projection_10yr" TYPE DECIMAL(14, 2) USING "projection_10yr"::DECIMAL(14, 2);
