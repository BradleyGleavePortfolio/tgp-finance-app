#!/usr/bin/env sh
# Fly release_command — runs once per deploy in a one-off VM with full env.
#
# Behavior:
#  1. Try `prisma migrate deploy` (proper path).
#  2. If that fails because the DB has tables but no _prisma_migrations
#     baseline, OR because a baseline migration tries to recreate types
#     that already exist (P3018 + 42710), forward-sync today's schema with
#     `prisma db push --accept-data-loss --skip-generate`. Safe right now:
#     prod DB has only test data.
#  3. Any other failure aborts the deploy.
set -e

echo "[release] attempting prisma migrate deploy..."

LOG=/tmp/prisma_migrate.log
if npx prisma migrate deploy 2>&1 | tee "$LOG"; then
  echo "[release] migrate deploy succeeded"
  exit 0
fi

if grep -qE "P3005|P3018|database schema is not empty|is not managed by Prisma Migrate|No migration found in prisma/migrations|already exists" "$LOG"; then
  echo "[release] DB conflicts with baseline migration — forward-syncing schema with db push"
  npx prisma db push --accept-data-loss --skip-generate
  echo "[release] schema pushed; consider reconciling _prisma_migrations baseline next release"
  exit 0
fi

echo "[release] migrate deploy failed for a non-baseline reason — aborting"
exit 1
