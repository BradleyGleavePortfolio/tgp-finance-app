-- Pre-TestFlight perf indexes flagged by /audits/00_MASTER_REPORT.md line 233.
--
-- Each index targets a hot path that previously fell back to a sequential
-- scan on tables with more than a handful of rows. `IF NOT EXISTS` keeps
-- the migration idempotent across re-applies (Fly's `prisma migrate deploy`
-- runs every cold start).
--
-- 1) users.coach_id — Coach OS roster filter (`role='student' AND coach_id = $1`)
CREATE INDEX IF NOT EXISTS "users_coach_id_idx" ON "users" ("coach_id");

-- 2) coach_notes.(coach_id, created_at) — coach inbox list with default
--    descending created_at sort.
CREATE INDEX IF NOT EXISTS "coach_notes_coach_id_created_at_idx"
  ON "coach_notes" ("coach_id", "created_at");

-- 3) program_templates.coach_id — Coach OS templates section reads.
CREATE INDEX IF NOT EXISTS "program_templates_coach_id_idx"
  ON "program_templates" ("coach_id");

-- 4) financial_accounts.(user_id, created_at) — Accounts tab list +
--    EOD recompute both filter by user_id and order by created_at.
CREATE INDEX IF NOT EXISTS "financial_accounts_user_id_created_at_idx"
  ON "financial_accounts" ("user_id", "created_at");
