-- Sprint A — multi-code invite flow + coach promotion audit log.
--
-- Reversible: a `down` companion below restores the prior state. The
-- model relies on prior migrations only for users(id).

CREATE TABLE "invite_codes" (
  "id"         TEXT        NOT NULL,
  "code"       TEXT        NOT NULL,
  "coach_id"   TEXT        NOT NULL,
  "expires_at" TIMESTAMP(3),
  "max_uses"   INTEGER,
  "used_count" INTEGER     NOT NULL DEFAULT 0,
  "revoked"    BOOLEAN     NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "invite_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invite_codes_code_key" ON "invite_codes" ("code");
CREATE INDEX "invite_codes_coach_id_created_at_idx"
  ON "invite_codes" ("coach_id", "created_at" DESC);

ALTER TABLE "invite_codes"
  ADD CONSTRAINT "invite_codes_coach_id_fkey"
  FOREIGN KEY ("coach_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "coach_promotion_audits" (
  "id"         TEXT        NOT NULL,
  "user_id"    TEXT        NOT NULL,
  "outcome"    TEXT        NOT NULL,
  "reason"     TEXT,
  "ip"         TEXT,
  "user_agent" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "coach_promotion_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "coach_promotion_audits_user_id_created_at_idx"
  ON "coach_promotion_audits" ("user_id", "created_at" DESC);
CREATE INDEX "coach_promotion_audits_outcome_created_at_idx"
  ON "coach_promotion_audits" ("outcome", "created_at" DESC);

ALTER TABLE "coach_promotion_audits"
  ADD CONSTRAINT "coach_promotion_audits_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reversal (commented for reference; Prisma applies forward-only):
--   DROP TABLE "coach_promotion_audits";
--   DROP TABLE "invite_codes";
