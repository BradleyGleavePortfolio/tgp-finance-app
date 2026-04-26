-- Migration: Community Contribution Loops (UX Psychology Report #5)
-- Creates community_wins and win_reactions tables

CREATE TYPE "WinVisibility" AS ENUM ('circle', 'public');
CREATE TYPE "ReactionKind" AS ENUM ('fire', 'clap');

CREATE TABLE "community_wins" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "visibility" "WinVisibility" NOT NULL DEFAULT 'public',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_wins_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "win_reactions" (
    "id" TEXT NOT NULL,
    "win_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "ReactionKind" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "win_reactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "community_wins_visibility_created_at_idx" ON "community_wins"("visibility", "created_at");
CREATE INDEX "win_reactions_user_id_idx" ON "win_reactions"("user_id");
CREATE UNIQUE INDEX "win_reactions_win_id_user_id_kind_key" ON "win_reactions"("win_id", "user_id", "kind");

ALTER TABLE "community_wins" ADD CONSTRAINT "community_wins_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "win_reactions" ADD CONSTRAINT "win_reactions_win_id_fkey"
    FOREIGN KEY ("win_id") REFERENCES "community_wins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
