-- Doctrine: drop streaks and reactions from the data model.
--
-- The `streak_days` and `streak_alerts_enabled` columns, along with the
-- WinReaction model and ReactionKind enum, were leftover from a Phase 1
-- gamification surface that was removed. The product now treats streaks /
-- reactions / badges as out-of-scope (no per-day continuity counters, no
-- per-win reactions, no per-user achievement tally).
--
-- This migration only drops fields that are not referenced by any current
-- TypeScript surface — those references were stripped in the same change set
-- that generated this migration. Application code is no longer reading or
-- writing these columns by the time this is applied.

-- 1) Drop FinancialProfile.streak_days
ALTER TABLE "financial_profiles" DROP COLUMN IF EXISTS "streak_days";

-- 2) Drop NotificationPreferences.streak_alerts_enabled
ALTER TABLE "notification_preferences" DROP COLUMN IF EXISTS "streak_alerts_enabled";

-- 3) Drop the win_reactions table and the ReactionKind enum it depends on
DROP TABLE IF EXISTS "win_reactions";
DROP TYPE IF EXISTS "ReactionKind";
