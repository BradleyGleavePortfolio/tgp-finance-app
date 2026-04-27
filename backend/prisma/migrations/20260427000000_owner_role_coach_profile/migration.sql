-- Phase 1B/1C: OWNER role + CoachProfile / invite_code
-- Purpose:
--   * Add OWNER as a first-class Role so admins can be distinguished from coaches.
--   * Introduce coach_profiles as the source of truth for per-coach metadata,
--     including the invite_code clients use to sign up under a specific coach.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'owner';

CREATE TABLE IF NOT EXISTS "coach_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "invite_code" TEXT NOT NULL,
    "display_name" TEXT,
    "bio" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "capacity" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coach_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "coach_profiles_user_id_key" ON "coach_profiles"("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "coach_profiles_invite_code_key" ON "coach_profiles"("invite_code");

ALTER TABLE "coach_profiles" ADD CONSTRAINT "coach_profiles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
