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
