-- Migration: server-side last-known-good response cache for the AI gateway.
--
-- The companion AICircuitBreakerService trips OPEN when the upstream Perplexity
-- gateway sustains five failures in a 60s window. While OPEN, callers must not
-- block on the upstream — they are served from this table instead. The breaker
-- only writes here on a successful upstream call, so every row is by definition
-- a known-good response from the production model.
--
-- Lookup strategy (read path, in priority order):
--   1) (intent, context_hash) exact hit  → previously-seen identical input
--   2) (intent, last_used_at desc)        → most recent good response for the intent
--   3) static fallback constant in code   → guaranteed-correct floor
--
-- The (intent, last_used_at) descending index serves both lookups: PostgreSQL
-- can walk the index leftmost forward for #1's predicate scan and backward for
-- #2's "give me the freshest row for this intent". Cardinality is small —
-- effectively bounded by distinct (intent, context_hash) pairs the breaker
-- has ever seen.

CREATE TABLE "ai_response_cache" (
    "id" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "context_hash" TEXT NOT NULL,
    "response_text" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_response_cache_pkey" PRIMARY KEY ("id")
);

-- Exact-key upsert path. Unique because (intent, context_hash) deterministically
-- identifies a single cached input — duplicate rows would just waste space and
-- defeat the most-recent ordering.
CREATE UNIQUE INDEX "ai_response_cache_intent_context_hash_key"
  ON "ai_response_cache"("intent", "context_hash");

-- "Most recent good response for this intent" lookup when the exact hash
-- doesn't match — used as the secondary fallback before the static floor.
CREATE INDEX "ai_response_cache_intent_last_used_at_idx"
  ON "ai_response_cache"("intent", "last_used_at" DESC);
