-- Migration: AI request ledger for the horizontally-safe per-user rate limiter.
-- Replaces the in-process Map counter in ai.service.ts that reset on every
-- Fly VM restart and didn't share state across VMs.

CREATE TABLE "ai_request_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_request_logs_pkey" PRIMARY KEY ("id")
);

-- Composite index serves the only hot read path:
--   SELECT count(*) FROM ai_request_logs
--   WHERE user_id = $1 AND created_at > now() - interval '1 hour';
CREATE INDEX "ai_request_logs_user_id_created_at_idx"
  ON "ai_request_logs"("user_id", "created_at");
