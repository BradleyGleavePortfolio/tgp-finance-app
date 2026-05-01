-- Migration: proof runtime scaffolding.
--
-- Adds the four proof tables (artifacts, signoffs, audit log, AI drafts) and
-- the four proof enums. See backend/src/proof/README.md for the trust model
-- and intended consumers. Hand-checked against the Prisma schema in this
-- commit; safe to run in any order relative to the existing money / AI
-- migrations because none of the existing tables are touched.

-- Enums --------------------------------------------------------------------

CREATE TYPE "ProofKind" AS ENUM (
  'net_worth_milestone',
  'finance_screenshot',
  'income_statement',
  'bank_statement',
  'platform_payout',
  'fitness_metric',
  'habit_consistency',
  'coach_report',
  'admin_report',
  'self_report',
  'milestone_review'
);

CREATE TYPE "ProofStatus" AS ENUM (
  'pending_review',
  'coach_signed_off',
  'coach_rejected',
  'admin_reviewed',
  'disputed',
  'flagged_abuse',
  'stale',
  'superseded'
);

CREATE TYPE "ProofSource" AS ENUM (
  'user_upload',
  'app_derived',
  'coach_entered',
  'admin_entered',
  'external_link'
);

CREATE TYPE "ProofAuditAction" AS ENUM (
  'submitted',
  'viewed',
  'coach_signoff',
  'coach_rejection',
  'admin_review',
  'dispute_opened',
  'dispute_resolved',
  'abuse_flag_raised',
  'abuse_flag_cleared',
  'marked_stale',
  'superseded',
  'ai_draft_generated',
  'ai_draft_dismissed',
  'amount_corrected'
);

-- proof_artifacts ----------------------------------------------------------

CREATE TABLE "proof_artifacts" (
  "id"                TEXT NOT NULL,
  "user_id"           TEXT NOT NULL,
  "reviewer_id"       TEXT,
  "kind"              "ProofKind" NOT NULL,
  "status"            "ProofStatus" NOT NULL DEFAULT 'pending_review',
  "source"            "ProofSource" NOT NULL,
  "claim_label"       TEXT NOT NULL,
  "claimed_amount"    DECIMAL(14,2),
  "currency"          TEXT NOT NULL DEFAULT 'USD',
  "occurred_at"       DATE NOT NULL,
  "submitted_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewed_at"       TIMESTAMP(3),
  "source_metadata"   JSONB NOT NULL,
  "user_note"         TEXT,
  "dispute_reason"    TEXT,
  "abuse_flag_reason" TEXT,
  "stale_after_days"  INTEGER,
  "superseded_by_id"  TEXT,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "proof_artifacts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "proof_artifacts_user_id_kind_status_idx"
  ON "proof_artifacts"("user_id", "kind", "status");
CREATE INDEX "proof_artifacts_reviewer_id_status_idx"
  ON "proof_artifacts"("reviewer_id", "status");
CREATE INDEX "proof_artifacts_status_occurred_at_idx"
  ON "proof_artifacts"("status", "occurred_at");

ALTER TABLE "proof_artifacts"
  ADD CONSTRAINT "proof_artifacts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proof_artifacts"
  ADD CONSTRAINT "proof_artifacts_reviewer_id_fkey"
  FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- proof_signoffs -----------------------------------------------------------

CREATE TABLE "proof_signoffs" (
  "id"            TEXT NOT NULL,
  "artifact_id"   TEXT NOT NULL,
  "reviewer_id"   TEXT NOT NULL,
  "reviewer_role" TEXT NOT NULL,
  "decision"      "ProofStatus" NOT NULL,
  "note"          TEXT,
  "supersedes_id" TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "proof_signoffs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "proof_signoffs_artifact_id_created_at_idx"
  ON "proof_signoffs"("artifact_id", "created_at");

ALTER TABLE "proof_signoffs"
  ADD CONSTRAINT "proof_signoffs_artifact_id_fkey"
  FOREIGN KEY ("artifact_id") REFERENCES "proof_artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- proof_audit_logs ---------------------------------------------------------

CREATE TABLE "proof_audit_logs" (
  "id"          TEXT NOT NULL,
  "artifact_id" TEXT NOT NULL,
  "actor_id"    TEXT,
  "actor_role"  TEXT NOT NULL,
  "action"      "ProofAuditAction" NOT NULL,
  "detail"      JSONB,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "proof_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "proof_audit_logs_artifact_id_created_at_idx"
  ON "proof_audit_logs"("artifact_id", "created_at");
CREATE INDEX "proof_audit_logs_actor_id_created_at_idx"
  ON "proof_audit_logs"("actor_id", "created_at");

ALTER TABLE "proof_audit_logs"
  ADD CONSTRAINT "proof_audit_logs_artifact_id_fkey"
  FOREIGN KEY ("artifact_id") REFERENCES "proof_artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proof_audit_logs"
  ADD CONSTRAINT "proof_audit_logs_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- proof_ai_drafts ----------------------------------------------------------

CREATE TABLE "proof_ai_drafts" (
  "id"              TEXT NOT NULL,
  "artifact_id"     TEXT NOT NULL,
  "draft_kind"      TEXT NOT NULL,
  "model_label"     TEXT NOT NULL,
  "prompt_version"  TEXT NOT NULL,
  "draft_text"      TEXT NOT NULL,
  "resolved_by_id"  TEXT,
  "resolved_action" TEXT,
  "resolved_at"     TIMESTAMP(3),
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "proof_ai_drafts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "proof_ai_drafts_artifact_id_created_at_idx"
  ON "proof_ai_drafts"("artifact_id", "created_at");

ALTER TABLE "proof_ai_drafts"
  ADD CONSTRAINT "proof_ai_drafts_artifact_id_fkey"
  FOREIGN KEY ("artifact_id") REFERENCES "proof_artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
