# Prisma & Schema

Prisma 5.22 against PostgreSQL. The schema lives in `schema.prisma` and the
applied SQL lives in `migrations/` (checked in — do not regenerate the dir).

`PrismaService` (`src/prisma/prisma.service.ts`) is a singleton injected
everywhere. It calls `$connect()` on `onModuleInit` and `$disconnect()` on
`onModuleDestroy`. Prefer constructor-injecting the service over calling the
generated client directly.

## Schema highlights

- **`User`** — keyed by application UUID; `supabase_id` is the link to
  Supabase Auth. Carries the application `role` (`student | coach | owner`),
  the optional `coach_id` foreign key (which coach owns this client), and a
  legacy `accountability_pair` partner pointer.
- **`CoachProfile`** — per-coach tenant metadata (Phase 1B). Source of truth
  for `invite_code`, `display_name`, `bio`, `is_active`, and `capacity`.
  Created lazily by `AdminService.ensureCoachProfile` when a user is promoted
  to `coach` or `owner`. Owners get one too because owners can run their own
  client roster.
- **`FinancialProfile`** — one row per user. Holds the cached aggregates
  (`net_worth_snapshot`, `total_debt`, `total_assets`, `total_cash`),
  streak counters, the priority-waterfall index, the user's typed dream/
  future-self prose, and notification timezone. Re-derived on every EOD
  submission inside the same transaction as the submission write.
- **`FinancialAccount`** — one row per checking / savings / brokerage /
  retirement / debt account. `balance` is signed *positive* whether the
  row is an asset or a debt; `is_debt` flips the sign in derivation.
- **`AccountBalanceLog`** — append-only history written by EOD form,
  manual updates, and onboarding. Used for savings-rate computation and
  per-account history charts.
- **`EODSubmission`** — the daily ledger row. Unique on
  `(user_id, submission_date)` — enforced both by the unique index and by a
  re-check inside the interactive transaction.
- **`WhatIfScenario`** — saved scenarios. `parameters` and `result_summary`
  are `Json` so the 12 scenario types share a single table.
- **`MilestoneUnlock`** — append-only unlock history; unique on
  `(user_id, milestone_key)` so re-checking is idempotent.
- **`HabitLog`** — daily habit completions; unique on
  `(user_id, habit_key, date)`.
- **`CoachNote`** — coach → student note. Either coach-private or visible to
  the student.
- **`ProgramTemplate`** — coach-defined multi-phase program; the apply
  action stamps a coach note and bumps the student's priority index.
- **`PushLog`** — append-only audit + dedupe key for outbound push
  notifications. Indexed on `(user_id, type, sent_at)` so the sender can
  fast-check daily and event dedupe windows.
- **`SpendingDnaReport`** — generated monthly per-user; unique on
  `(user_id, month)` so regeneration is an upsert.
- **`CommunityWin`** — anonymized contribution-loop feed (read-only;
  no per-user reaction tally surface).
- **`UserPreferences`** — UI personalization (home modules, tone,
  cadence, currency, first-day-of-week).

Enums (`Role`, `AccountType`, `RiskTolerance`, `MotivationStyle`,
`LogSource`, `ScenarioType`, `WinVisibility`) are fixed in the schema
and mirrored as TypeScript unions where the client uses them.

## Migration history

Order is significant — see filenames:

1. `20260423000000_baseline` — production schema as it existed at the
   round-2 stability cut (money columns were `DOUBLE PRECISION`).
2. `20260423000000_init` — first full snapshot for fresh dev environments.
3. `20260423000001_money_fields_to_decimal` — converts every money column
   to `DECIMAL(14, 2)`. The cast is safe because production values fit
   inside that range easily; the API serializes back to `Number` via
   `DecimalToNumberInterceptor` so the mobile JSON shape doesn't change.
4. `20260424000000_notification_prefs_new_toggles` — adds
   `red_flag_alerts`, `future_self_letter_enabled`,
   `priority_levelup_alerts`, `spending_dna_alerts` plus `timezone` and
   `expo_push_token`.
5. `20260424180000_push_logs` — adds `push_logs` table and its index.
6. `20260425000000_add_user_preferences` — adds `user_preferences`.
7. `20260427000000_owner_role_coach_profile` — Phase 1B/1C: `owner` enum
   value + `coach_profiles` table.
8. `20260501000000_community_contribution_loops` — community wins +
   reactions.

## Deploy flow

```
npx prisma migrate deploy
```

Run on every backend boot (Fly.io `release_command` or as a Dockerfile
pre-start). Idempotent — the `_prisma_migrations` table tracks what's
applied.

**First deploy after the round-2 PR**, against a database that already
existed in production, requires telling Prisma the baseline is satisfied:

```
npx prisma migrate resolve --applied 20260423000000_baseline
```

Run this once. Skipping it makes `migrate deploy` try to recreate the
existing tables and fail with "relation already exists." Fresh / dev
databases can run `migrate deploy` directly with no resolve step.

## Ledger caveats

- **Balance polarity.** Account `balance` is always non-negative; sign is
  derived from `is_debt`. Treat `balance` as an unsigned magnitude in any
  new code — `total_assets` and `total_debt` are reduced separately and
  combined into net worth as `assets - debt`.
- **Why we keep both account `balance` and `AccountBalanceLog`.** The live
  `balance` is the cached "now" value the UI reads on every dashboard
  refresh. The log is the immutable history used for savings-rate, per-
  account charts, and the EOD audit trail. The EOD service writes both
  inside the same transaction so they cannot drift — if either write
  fails, the entire submission rolls back.
- **EOD is the recompute trigger.** Net-worth fields on `FinancialProfile`
  are re-derived from `account_snapshots` on every submission. We do
  **not** trust mid-day account edits to update profile aggregates;
  intra-day account edits change `FinancialAccount.balance` but the
  profile-level cache only refreshes on EOD. This is intentional — the
  product is built around a daily check-in cadence — but it means the
  dashboard's "as of last EOD" labels matter.
- **Savings-rate gotcha.** `NetWorthService` computes savings rate from
  growth in savings + brokerage + retirement accounts over the trailing
  30 days. Until the round-2 fix, the filter used enum values that never
  matched the actual `AccountType` strings, so savings rate was always 0.
  When adding new account types, update both `accounts.service.ts`
  `isDebtType` and the savings-rate filter in
  `networth.service.ts`.
- **Decimal precision in code.** Prisma returns `Decimal` objects for
  money fields. Pass them through `toN()` (`common/money.ts`) before any
  arithmetic — `+` on a `Decimal` and a plain number coerces to a string
  and silently corrupts the result.
- **Velocity score reads inside the transaction.** `computeWealthVelocity`
  is invoked with the `Tx` client so its lookups see the just-committed
  totals from the current submission, not stale values from before.
- **Soft-delete on accounts.** `AccountsService.deleteAccount` flips
  `is_active=false` rather than deleting. History (logs, EODs that
  reference the account) is preserved.

## Adding a migration

```
npx prisma migrate dev --name short_description
```

Aim the dev `DATABASE_URL` at a throwaway database (Supabase has free
shadow databases). Commit the generated SQL file. Do not edit applied
migrations after they ship — make a new one.

## Files

- `schema.prisma` — single source of truth for the DB shape. Owns the
  enum list and the `@@map(...)` table-name mapping.
- `migrations/` — append-only SQL history. Tracked in git.
- `migrations/README.md` — deploy + baseline flow.
- `migration_lock.toml` — provider lock; do not edit by hand.
