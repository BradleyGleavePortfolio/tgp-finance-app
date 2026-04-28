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
set -euo pipefail

echo "[release] attempting prisma migrate deploy..."

LOG=/tmp/prisma_migrate.log
if npx prisma migrate deploy 2>&1 | tee "$LOG"; then
  echo "[release] migrate deploy succeeded"
  exit 0
fi

if grep -qE "P3005|P3018|P3009|database schema is not empty|is not managed by Prisma Migrate|No migration found in prisma/migrations|already exists|migrate found failed migrations" "$LOG"; then
  echo "[release] baseline / failed-migration conflict detected — recovering"

  # Extract any failed migration names from the log and mark them rolled-back
  # so the migrations table stops blocking. `migrate resolve` is idempotent.
  FAILED=$(grep -oE "[0-9]{14}_[a-zA-Z0-9_]+" "$LOG" | sort -u)
  for m in $FAILED; do
    echo "[release] marking failed migration $m as rolled-back"
    npx prisma migrate resolve --rolled-back "$m" || true
  done

  echo "[release] forward-syncing schema with db push --accept-data-loss"
  npx prisma db push --accept-data-loss --skip-generate
  echo "[release] schema pushed; consider reconciling _prisma_migrations baseline next release"
  exit 0
fi

echo "[release] migrate deploy failed for a non-baseline reason — aborting"
exit 1
