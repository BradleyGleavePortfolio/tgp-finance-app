-- Add three new per-user notification toggles for the client-side scheduled
-- local notifications introduced with push-notifications v1:
--   * future_self_letter_enabled — one-shot day-90 Future-Self Letter delivery
--   * priority_levelup_alerts     — Priority Waterfall transition ping
--   * spending_dna_alerts         — monthly Spending DNA report ping
-- All default true so existing users opt into the new surfaces; the Settings
-- screen lets them disable any individually.
ALTER TABLE "notification_preferences"
  ADD COLUMN "future_self_letter_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "priority_levelup_alerts" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "spending_dna_alerts" BOOLEAN NOT NULL DEFAULT true;
