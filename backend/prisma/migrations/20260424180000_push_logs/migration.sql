-- Real server-side push notification delivery: track every push we attempt
-- so the cron/event handlers can dedupe sends and surface delivery errors
-- without depending on the client to report back. Every row represents a
-- single attempted push, successful or not.
CREATE TABLE "push_logs" (
    "id"      TEXT          NOT NULL,
    "user_id" TEXT          NOT NULL,
    "type"    TEXT          NOT NULL,
    "title"   TEXT          NOT NULL,
    "body"    TEXT          NOT NULL,
    "data"    JSONB,
    "sent_at" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error"   TEXT,

    CONSTRAINT "push_logs_pkey" PRIMARY KEY ("id")
);

-- Dedupe queries hit (user_id, type, sent_at range) hard in every cron tick.
CREATE INDEX "push_logs_user_id_type_sent_at_idx"
    ON "push_logs" ("user_id", "type", "sent_at");
