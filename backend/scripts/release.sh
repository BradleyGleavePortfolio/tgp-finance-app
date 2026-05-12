#!/usr/bin/env bash
# Fly release_command — runs once per deploy in a one-off VM with full env.
#
# Behavior:
#  1. Try `prisma migrate deploy` (proper path).
#  2. On baseline conflicts (P3005 schema not empty, P3018 migration failed
#     because objects already exist, P3009 prior failed migration is
#     blocking new ones): mark every failed migration as rolled-back so
#     Prisma's migration table stops blocking, then forward-sync today's
#     schema with `prisma db push --accept-data-loss --skip-generate`.
#     Safe right now: prod DB has only test data.
#  3. Any other failure aborts the deploy.
#
# Invoked as `bash ./scripts/release.sh` from fly.toml — bash ships with the
# node:20-slim base image, so no extra packages are required.
#
# Each Prisma step is wrapped in `timeout` so a stuck advisory lock (left
# behind by a previous release_command machine that hit Fly's wait-for-
# destroyed timeout) fails the deploy with a useful error within minutes
# instead of letting the release_command VM hang silently to the outer
# flyctl release-command-timeout. If you see the timeout fire, a human
# needs to clear the stale lock — see RUNBOOK.md.
set -euo pipefail

# `timeout` is provided by coreutils on the node:20-slim base image. Each
# step gets enough headroom to handle a slow remote DB without ever sitting
# longer than the outer flyctl release-command-timeout (15m).
MIGRATE_TIMEOUT="${MIGRATE_TIMEOUT:-8m}"
PUSH_TIMEOUT="${PUSH_TIMEOUT:-5m}"
RESOLVE_TIMEOUT="${RESOLVE_TIMEOUT:-1m}"

# Prisma's migration engine acquires a session-level advisory lock, which
# Supabase's PgBouncer pooler (port 6543, transaction mode) cannot hold —
# the lock never resolves and migrate hangs to MIGRATE_TIMEOUT. Route
# migrations through DIRECT_URL (port 5432) when set; fall back to
# DATABASE_URL so local dev (no pooler) keeps working.
if [ -z "${DIRECT_URL:-}" ]; then
  echo "[release] DIRECT_URL not set; using DATABASE_URL for migrations"
  PRISMA_MIGRATION_URL="${DATABASE_URL}"
else
  echo "[release] routing migrations through DIRECT_URL"
  PRISMA_MIGRATION_URL="${DIRECT_URL}"
fi

echo "[release] attempting prisma migrate deploy (timeout: ${MIGRATE_TIMEOUT})..."

LOG=/tmp/prisma_migrate.log
set +e
DATABASE_URL="${PRISMA_MIGRATION_URL}" timeout --preserve-status "${MIGRATE_TIMEOUT}" npx prisma migrate deploy 2>&1 | tee "$LOG"
MIGRATE_EXIT=${PIPESTATUS[0]}
set -e

if [ "${MIGRATE_EXIT}" -eq 0 ]; then
  echo "[release] migrate deploy succeeded"
  exit 0
fi

# `timeout` exits 124 on timeout, 137 on SIGKILL. Surface both clearly so the
# human reading the deploy log knows it was a hang, not a Prisma error.
if [ "${MIGRATE_EXIT}" -eq 124 ] || [ "${MIGRATE_EXIT}" -eq 137 ]; then
  echo "[release] FATAL: prisma migrate deploy exceeded ${MIGRATE_TIMEOUT}." >&2
  echo "[release] Likely a stale advisory lock from a prior aborted release_command." >&2
  echo "[release] See RUNBOOK.md > 'Stuck Fly release_command' for remediation." >&2
  exit 1
fi

if grep -qE "P3005|P3018|P3009|database schema is not empty|is not managed by Prisma Migrate|No migration found in prisma/migrations|already exists|migrate found failed migrations" "$LOG"; then
  echo "[release] baseline / failed-migration conflict detected — recovering"

  # Extract any failed migration names from the log and mark them rolled-back
  # so the migrations table stops blocking. `migrate resolve` is idempotent.
  FAILED=$(grep -oE "[0-9]{14}_[a-zA-Z0-9_]+" "$LOG" | sort -u)
  for m in $FAILED; do
    echo "[release] marking failed migration $m as rolled-back"
    DATABASE_URL="${PRISMA_MIGRATION_URL}" timeout --preserve-status "${RESOLVE_TIMEOUT}" npx prisma migrate resolve --rolled-back "$m" || true
  done

  echo "[release] forward-syncing schema with db push --accept-data-loss (timeout: ${PUSH_TIMEOUT})"
  set +e
  DATABASE_URL="${PRISMA_MIGRATION_URL}" timeout --preserve-status "${PUSH_TIMEOUT}" npx prisma db push --accept-data-loss --skip-generate
  PUSH_EXIT=$?
  set -e
  if [ "${PUSH_EXIT}" -ne 0 ]; then
    if [ "${PUSH_EXIT}" -eq 124 ] || [ "${PUSH_EXIT}" -eq 137 ]; then
      echo "[release] FATAL: prisma db push exceeded ${PUSH_TIMEOUT} — likely stuck advisory lock." >&2
    else
      echo "[release] FATAL: prisma db push failed (exit ${PUSH_EXIT})." >&2
    fi
    exit 1
  fi
  echo "[release] schema pushed; consider reconciling _prisma_migrations baseline next release"
  exit 0
fi

echo "[release] migrate deploy failed for a non-baseline reason — aborting"
exit 1
