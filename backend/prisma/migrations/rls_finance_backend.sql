-- RLS defense-in-depth migration for tgp-finance-app/backend
-- Prisma stores application UUIDs as TEXT in this schema, so policies compare
-- against app.current_user_id() as TEXT rather than casting to uuid.
-- Prisma's production connection uses Supabase service_role and therefore
-- bypasses RLS; these policies protect direct Studio/dashboard access and any
-- future anon/authenticated-key code path.

BEGIN;

-- 1) Supabase creates service_role; confirm it has BYPASSRLS for Prisma.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    ALTER ROLE service_role BYPASSRLS;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS app;
CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')
$$;

COMMENT ON FUNCTION app.current_user_id() IS
  'Returns the NestJS-authenticated users.id stored in app.current_user_id for RLS policies; NULL means unauthenticated/no tenant context.';

-- 2) Enable and force RLS on finance tenant tables.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
ALTER TABLE "financial_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "financial_accounts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "account_balance_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "account_balance_logs" FORCE ROW LEVEL SECURITY;
ALTER TABLE "coach_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coach_messages" FORCE ROW LEVEL SECURITY;
ALTER TABLE "financial_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "financial_profiles" FORCE ROW LEVEL SECURITY;
ALTER TABLE "eod_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eod_submissions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "what_if_scenarios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "what_if_scenarios" FORCE ROW LEVEL SECURITY;
ALTER TABLE "milestone_unlocks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "milestone_unlocks" FORCE ROW LEVEL SECURITY;
ALTER TABLE "notification_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_preferences" FORCE ROW LEVEL SECURITY;
ALTER TABLE "habit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "habit_logs" FORCE ROW LEVEL SECURITY;
ALTER TABLE "push_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "push_logs" FORCE ROW LEVEL SECURITY;
ALTER TABLE "spending_dna_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "spending_dna_reports" FORCE ROW LEVEL SECURITY;
ALTER TABLE "user_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_preferences" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ai_request_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_request_logs" FORCE ROW LEVEL SECURITY;
ALTER TABLE "coach_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coach_profiles" FORCE ROW LEVEL SECURITY;
ALTER TABLE "coach_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coach_notes" FORCE ROW LEVEL SECURITY;
ALTER TABLE "program_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "program_templates" FORCE ROW LEVEL SECURITY;
ALTER TABLE "client_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "client_assignments" FORCE ROW LEVEL SECURITY;
ALTER TABLE "invite_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invite_codes" FORCE ROW LEVEL SECURITY;
ALTER TABLE "coach_promotion_audits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coach_promotion_audits" FORCE ROW LEVEL SECURITY;

-- 3) Policies. Drop first so the migration is safe to re-run during staging hardening.

-- User identity rows are private; a non-bypass role can only operate on its own user record.
DROP POLICY IF EXISTS "users_self_access" ON "users";
CREATE POLICY "users_self_access" ON "users"
  FOR ALL TO public
  USING ("id" = app.current_user_id())
  WITH CHECK ("id" = app.current_user_id());

-- Financial accounts are the core account/balance records and are isolated by financial_accounts.user_id.
DROP POLICY IF EXISTS "financial_accounts_owner_access" ON "financial_accounts";
CREATE POLICY "financial_accounts_owner_access" ON "financial_accounts"
  FOR ALL TO public
  USING ("user_id" = app.current_user_id())
  WITH CHECK ("user_id" = app.current_user_id());

-- Balance logs inherit ownership from their parent account to avoid duplicating user_id on every log row.
DROP POLICY IF EXISTS "account_balance_logs_owner_access" ON "account_balance_logs";
CREATE POLICY "account_balance_logs_owner_access" ON "account_balance_logs"
  FOR ALL TO public
  USING (EXISTS (
    SELECT 1 FROM "financial_accounts" fa
    WHERE fa."id" = "account_balance_logs"."account_id"
      AND fa."user_id" = app.current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "financial_accounts" fa
    WHERE fa."id" = "account_balance_logs"."account_id"
      AND fa."user_id" = app.current_user_id()
  ));

-- Coach/client messages are private to the two thread participants.
DROP POLICY IF EXISTS "coach_messages_participant_access" ON "coach_messages";
CREATE POLICY "coach_messages_participant_access" ON "coach_messages"
  FOR ALL TO public
  USING ("sender_id" = app.current_user_id() OR "recipient_id" = app.current_user_id())
  WITH CHECK ("sender_id" = app.current_user_id() OR "recipient_id" = app.current_user_id());

-- Financial profile data includes income, tax, and net-worth details; isolate by owner user_id.
DROP POLICY IF EXISTS "financial_profiles_owner_access" ON "financial_profiles";
CREATE POLICY "financial_profiles_owner_access" ON "financial_profiles"
  FOR ALL TO public
  USING ("user_id" = app.current_user_id())
  WITH CHECK ("user_id" = app.current_user_id());

-- End-of-day submissions include account snapshots and AI insights; isolate by submitting user_id.
DROP POLICY IF EXISTS "eod_submissions_owner_access" ON "eod_submissions";
CREATE POLICY "eod_submissions_owner_access" ON "eod_submissions"
  FOR ALL TO public
  USING ("user_id" = app.current_user_id())
  WITH CHECK ("user_id" = app.current_user_id());

-- What-if scenarios contain personal financial planning assumptions; isolate by owner user_id.
DROP POLICY IF EXISTS "what_if_scenarios_owner_access" ON "what_if_scenarios";
CREATE POLICY "what_if_scenarios_owner_access" ON "what_if_scenarios"
  FOR ALL TO public
  USING ("user_id" = app.current_user_id())
  WITH CHECK ("user_id" = app.current_user_id());

-- Milestone unlocks are per-user progress markers and must not cross tenants.
DROP POLICY IF EXISTS "milestone_unlocks_owner_access" ON "milestone_unlocks";
CREATE POLICY "milestone_unlocks_owner_access" ON "milestone_unlocks"
  FOR ALL TO public
  USING ("user_id" = app.current_user_id())
  WITH CHECK ("user_id" = app.current_user_id());

-- Notification preferences include push tokens and messaging toggles; isolate by owner user_id.
DROP POLICY IF EXISTS "notification_preferences_owner_access" ON "notification_preferences";
CREATE POLICY "notification_preferences_owner_access" ON "notification_preferences"
  FOR ALL TO public
  USING ("user_id" = app.current_user_id())
  WITH CHECK ("user_id" = app.current_user_id());

-- Habit logs are per-user behavioral records; isolate by owner user_id.
DROP POLICY IF EXISTS "habit_logs_owner_access" ON "habit_logs";
CREATE POLICY "habit_logs_owner_access" ON "habit_logs"
  FOR ALL TO public
  USING ("user_id" = app.current_user_id())
  WITH CHECK ("user_id" = app.current_user_id());

-- Push logs contain notification content and delivery errors scoped to one user.
DROP POLICY IF EXISTS "push_logs_owner_access" ON "push_logs";
CREATE POLICY "push_logs_owner_access" ON "push_logs"
  FOR ALL TO public
  USING ("user_id" = app.current_user_id())
  WITH CHECK ("user_id" = app.current_user_id());

-- Spending DNA reports summarize personal financial behavior; isolate by owner user_id.
DROP POLICY IF EXISTS "spending_dna_reports_owner_access" ON "spending_dna_reports";
CREATE POLICY "spending_dna_reports_owner_access" ON "spending_dna_reports"
  FOR ALL TO public
  USING ("user_id" = app.current_user_id())
  WITH CHECK ("user_id" = app.current_user_id());

-- User preferences are tenant-specific product settings and should only be visible to the owner.
DROP POLICY IF EXISTS "user_preferences_owner_access" ON "user_preferences";
CREATE POLICY "user_preferences_owner_access" ON "user_preferences"
  FOR ALL TO public
  USING ("user_id" = app.current_user_id())
  WITH CHECK ("user_id" = app.current_user_id());

-- AI request logs are per-user rate-limit/audit records and must not leak prompt metadata across users.
DROP POLICY IF EXISTS "ai_request_logs_owner_access" ON "ai_request_logs";
CREATE POLICY "ai_request_logs_owner_access" ON "ai_request_logs"
  FOR ALL TO public
  USING ("user_id" = app.current_user_id())
  WITH CHECK ("user_id" = app.current_user_id());

-- Coach profiles are managed by the coach/owner represented by user_id.
DROP POLICY IF EXISTS "coach_profiles_owner_access" ON "coach_profiles";
CREATE POLICY "coach_profiles_owner_access" ON "coach_profiles"
  FOR ALL TO public
  USING ("user_id" = app.current_user_id())
  WITH CHECK ("user_id" = app.current_user_id());

-- Coach notes are shared only between the coach author and the student subject.
DROP POLICY IF EXISTS "coach_notes_coach_or_student_access" ON "coach_notes";
CREATE POLICY "coach_notes_coach_or_student_access" ON "coach_notes"
  FOR ALL TO public
  USING ("coach_id" = app.current_user_id() OR "student_id" = app.current_user_id())
  WITH CHECK ("coach_id" = app.current_user_id() OR "student_id" = app.current_user_id());

-- Program templates are coach-owned resources and should not be editable/readable by other coaches or clients.
DROP POLICY IF EXISTS "program_templates_coach_owner_access" ON "program_templates";
CREATE POLICY "program_templates_coach_owner_access" ON "program_templates"
  FOR ALL TO public
  USING ("coach_id" = app.current_user_id())
  WITH CHECK ("coach_id" = app.current_user_id());

-- Client assignments are shared records: the coach and assigned client can both access them.
DROP POLICY IF EXISTS "client_assignments_coach_or_client_access" ON "client_assignments";
CREATE POLICY "client_assignments_coach_or_client_access" ON "client_assignments"
  FOR ALL TO public
  USING ("coach_id" = app.current_user_id() OR "client_id" = app.current_user_id())
  WITH CHECK ("coach_id" = app.current_user_id() OR "client_id" = app.current_user_id());

-- Invite codes are coach-owned for management; anonymous redemption must go through controlled service-role API paths.
DROP POLICY IF EXISTS "invite_codes_coach_owner_access" ON "invite_codes";
CREATE POLICY "invite_codes_coach_owner_access" ON "invite_codes"
  FOR ALL TO public
  USING ("coach_id" = app.current_user_id())
  WITH CHECK ("coach_id" = app.current_user_id());

-- Promotion audit rows are visible only to the user whose promotion attempt was recorded.
DROP POLICY IF EXISTS "coach_promotion_audits_owner_access" ON "coach_promotion_audits";
CREATE POLICY "coach_promotion_audits_owner_access" ON "coach_promotion_audits"
  FOR ALL TO public
  USING ("user_id" = app.current_user_id())
  WITH CHECK ("user_id" = app.current_user_id());

-- 4) Grants for the bypass role used by Prisma/Supabase service key.
GRANT USAGE ON SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA app TO service_role, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.current_user_id() TO service_role, anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

COMMIT;

-- Rollback script (manual):
-- BEGIN;
-- DROP POLICY IF EXISTS "users_self_access" ON "users";
-- DROP POLICY IF EXISTS "financial_accounts_owner_access" ON "financial_accounts";
-- DROP POLICY IF EXISTS "account_balance_logs_owner_access" ON "account_balance_logs";
-- DROP POLICY IF EXISTS "coach_messages_participant_access" ON "coach_messages";
-- DROP POLICY IF EXISTS "financial_profiles_owner_access" ON "financial_profiles";
-- DROP POLICY IF EXISTS "eod_submissions_owner_access" ON "eod_submissions";
-- DROP POLICY IF EXISTS "what_if_scenarios_owner_access" ON "what_if_scenarios";
-- DROP POLICY IF EXISTS "milestone_unlocks_owner_access" ON "milestone_unlocks";
-- DROP POLICY IF EXISTS "notification_preferences_owner_access" ON "notification_preferences";
-- DROP POLICY IF EXISTS "habit_logs_owner_access" ON "habit_logs";
-- DROP POLICY IF EXISTS "push_logs_owner_access" ON "push_logs";
-- DROP POLICY IF EXISTS "spending_dna_reports_owner_access" ON "spending_dna_reports";
-- DROP POLICY IF EXISTS "user_preferences_owner_access" ON "user_preferences";
-- DROP POLICY IF EXISTS "ai_request_logs_owner_access" ON "ai_request_logs";
-- DROP POLICY IF EXISTS "coach_profiles_owner_access" ON "coach_profiles";
-- DROP POLICY IF EXISTS "coach_notes_coach_or_student_access" ON "coach_notes";
-- DROP POLICY IF EXISTS "program_templates_coach_owner_access" ON "program_templates";
-- DROP POLICY IF EXISTS "client_assignments_coach_or_client_access" ON "client_assignments";
-- DROP POLICY IF EXISTS "invite_codes_coach_owner_access" ON "invite_codes";
-- DROP POLICY IF EXISTS "coach_promotion_audits_owner_access" ON "coach_promotion_audits";
-- ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "financial_accounts" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "account_balance_logs" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "coach_messages" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "financial_profiles" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "eod_submissions" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "what_if_scenarios" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "milestone_unlocks" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "notification_preferences" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "habit_logs" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "push_logs" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "spending_dna_reports" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "user_preferences" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "ai_request_logs" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "coach_profiles" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "coach_notes" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "program_templates" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "client_assignments" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "invite_codes" DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE "coach_promotion_audits" DISABLE ROW LEVEL SECURITY;
-- DROP FUNCTION IF EXISTS app.current_user_id();
-- COMMIT;
