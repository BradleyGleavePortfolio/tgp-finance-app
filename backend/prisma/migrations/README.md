# Prisma Migrations

This directory holds the versioned SQL migrations for the Postgres schema. It is
tracked in git (was previously gitignored — fixed in the round-2 stability PR).

## Deploy flow

Every backend boot runs:

```
npx prisma migrate deploy
```

This applies any pending migrations in order and records them in the
`_prisma_migrations` table. Safe to run repeatedly.

Wire it up as a Fly.io `release_command` in `fly.toml`, or as a pre-start script
in the Dockerfile (`CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]`).

## Baseline

`20260423000000_baseline/migration.sql` reflects the schema as it existed in
production immediately **before** this PR — all money fields were `Float`
(PostgreSQL `DOUBLE PRECISION`). Since production already has these tables,
on first deploy after this PR lands you must tell Prisma the baseline is
already applied:

```
npx prisma migrate resolve --applied 20260423000000_baseline
```

Run this once against prod before the first real `migrate deploy`. Any
fresh/dev environment can run `migrate deploy` directly — it will create the
tables from scratch.

## Money → Decimal

`20260423000001_money_fields_to_decimal/migration.sql` converts every
money-bearing column from `DOUBLE PRECISION` to `DECIMAL(14, 2)`. The cast is
safe because existing values fit comfortably. At the API layer a NestJS
interceptor converts `Decimal` instances back to `Number` in JSON responses so
the mobile client sees the same shape it always has.

## Creating a new migration

Point `DATABASE_URL` at a dev database and:

```
npx prisma migrate dev --name describe_change_here
```

Commit the generated SQL file.

## Migration ledger (current order)

Order is significant — `_prisma_migrations` records what's applied and Prisma
refuses to run them out of order. Filenames are sorted lexicographically.

1. `20260423000000_baseline` — production schema as of the round-2 stability cut.
2. `20260423000000_init` — first full snapshot for fresh dev environments.
3. `20260423000001_money_fields_to_decimal` — money columns to `DECIMAL(14,2)`.
4. `20260424000000_notification_prefs_new_toggles` — adds notification prefs +
   `timezone` + `expo_push_token`.
5. `20260424180000_push_logs` — adds `push_logs` table + index.
6. `20260425000000_add_user_preferences` — adds `user_preferences`.
7. `20260427000000_owner_role_coach_profile` — Phase 1B/1C OWNER role +
   `coach_profiles` table.
8. `20260501000000_community_contribution_loops` — community wins + reactions.

Whenever you add a migration, append it here in the same PR. Future you (and
the on-call human looking at a deploy failure) shouldn't have to reconstruct
order from `ls`.

## Smoke check after deploy

Once a release goes out, verify the ledger landed cleanly:

```
# 1. Process is up
curl -fsS https://<host>/health | jq

# 2. DB is reachable from the new VM (this is the one that catches a
#    successful release_command paired with a broken connection string)
curl -fsS https://<host>/health/deep | jq

# 3. The release that's actually running is the one you intended
curl -fsS https://<host>/system/release-info | jq
```

If `/health/deep` returns `status: "degraded"` with a database error, the
release-command migration step likely succeeded against a different DB than
the runtime is pointed at — check `DATABASE_URL` parity between the
`release_command` env and the runtime env in `fly.toml`/Fly secrets.

## Recovering from a stuck ledger

`backend/scripts/release.sh` already handles the common P3005/P3009/P3018
baseline conflicts on Fly's `release_command`. If you need to do this by hand
against a database where Prisma's ledger has diverged from the actual schema:

```
# 1. Mark every failed migration as rolled-back (idempotent).
npx prisma migrate status                       # find the failed one(s)
npx prisma migrate resolve --rolled-back <name>

# 2. Forward-sync the schema. --accept-data-loss is honest: prisma db push
#    will drop columns/tables not in schema.prisma. Today our prod database
#    has only test data, so this is acceptable. Re-evaluate before the first
#    real-customer cohort lands.
npx prisma db push --accept-data-loss --skip-generate
```

Reconcile the `_prisma_migrations` baseline at the next release once you've
verified the schema is correct.
