-- Stage 2 — Coach Operating System
-- Adds: client_assignments, coach_messages, community_posts
-- Extends: User (no column changes — only Prisma-side relations)
--
-- Indexes are designed for the hot read paths:
--   - Coach dashboard pulls assignments by client + status
--   - Coach inbox pulls messages by recipient + unread state
--   - Community feed pulls posts by author + status + published_at desc

-- ─── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE "AssignmentStatus" AS ENUM ('open', 'completed', 'dismissed');
CREATE TYPE "AssignmentType"   AS ENUM ('budget', 'savings_challenge', 'debt_paydown', 'habit', 'custom');
CREATE TYPE "CommunityPostStatus" AS ENUM ('draft', 'published', 'archived');

-- ─── client_assignments ──────────────────────────────────────────────────────

CREATE TABLE "client_assignments" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assignment_type" "AssignmentType" NOT NULL DEFAULT 'custom',
    "due_date" TIMESTAMP(3),
    "status" "AssignmentStatus" NOT NULL DEFAULT 'open',
    "target_value" DECIMAL(14, 2),
    "target_unit" TEXT,
    "coach_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "client_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "client_assignments_client_id_status_idx"
    ON "client_assignments"("client_id", "status");

CREATE INDEX "client_assignments_coach_id_created_at_idx"
    ON "client_assignments"("coach_id", "created_at" DESC);

ALTER TABLE "client_assignments"
    ADD CONSTRAINT "client_assignments_coach_id_fkey"
    FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "client_assignments"
    ADD CONSTRAINT "client_assignments_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── coach_messages ──────────────────────────────────────────────────────────

CREATE TABLE "coach_messages" (
    "id" TEXT NOT NULL,
    "thread_key" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "coach_messages_thread_key_created_at_idx"
    ON "coach_messages"("thread_key", "created_at");

CREATE INDEX "coach_messages_recipient_id_read_at_idx"
    ON "coach_messages"("recipient_id", "read_at");

ALTER TABLE "coach_messages"
    ADD CONSTRAINT "coach_messages_sender_id_fkey"
    FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "coach_messages"
    ADD CONSTRAINT "coach_messages_recipient_id_fkey"
    FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- ─── community_posts ─────────────────────────────────────────────────────────

CREATE TABLE "community_posts" (
    "id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "resource_url" TEXT,
    "status" "CommunityPostStatus" NOT NULL DEFAULT 'published',
    "audience" TEXT NOT NULL DEFAULT 'own_clients',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "community_posts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "community_posts_author_id_status_published_at_idx"
    ON "community_posts"("author_id", "status", "published_at" DESC);

ALTER TABLE "community_posts"
    ADD CONSTRAINT "community_posts_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
