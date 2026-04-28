# Multi-tenant isolation: how it's enforced today, and the RLS plan

## Where the trust boundaries are

The backend is a single Postgres database serving three roles:

- **owner** — admin / founder; reads anything, writes anything.
- **coach** — reads their own roster's student data, writes coach-keyed
  resources (notes, templates, alerts).
- **student** — reads and writes their own user-keyed data.

There are four enforcement layers, in order:

1. **JwtAuthGuard** (global) — verifies the Supabase JWT, hydrates
   `request.user = { id, role, coach_id }`. Any route without `@Public()`
   that doesn't get a valid JWT is rejected with `UNAUTHENTICATED`.
2. **TenantGuard** (global) — students whose route param `:userId` doesn't
   match `request.user.id` are rejected with `TENANT_VIOLATION`. Owners /
   coaches pass through; coach-row scoping happens at layer 3.
3. **OwnsStudentGuard** (route-level, applied to coach routes that take a
   student id) — coach can only act on a student where
   `student.coach_id === user.id`. Owner bypass.
4. **Service-layer guardrails** (`src/common/tenancy.ts`,
   `src/auth/scope.ts`) — `assertOwnsRecord`, `assertCoachOwnsRecord`,
   `scopeToSelf`, `scopeToCoach`. Any service method that loads a row by
   primary key and then mutates it should call the matching assertion
   between the read and the write. This is belt-and-suspenders; the route
   guards already cover the common case.

## Why service-layer guardrails matter even with route guards

A route guard sees the URL. It does not see the body. If a controller takes
a body field like `account_id` and the service trusts it, the route guard
won't catch a request that has a valid `:userId` route param but an
`account_id` belonging to someone else.

The fix isn't a new guard — it's: the service does
`prisma.financialAccount.findUnique({ where: { id } })`, then
`assertOwnsRecord(user, account)`, then mutates. That pattern already lives
in `accounts.service.ts`, `accountability.service.ts`,
`coach.service.ts`, etc.; the new helpers in `src/common/tenancy.ts`
formalize it so future services don't have to reinvent it.

Tests live in `test/tenancy.spec.ts` and pin down:

- owner bypass works for both user- and coach-keyed records,
- a student cannot touch another student's row,
- a coach cannot touch a student's record through the user-keyed path
  (they must go through the coach service, which uses `coach_id` scoping),
- a null record yields a generic Forbidden instead of leaking existence.

## Why we don't ship full Postgres RLS yet

Row-Level Security would push the same enforcement *into* the database, so
even a service bug (forgot the `where: { user_id }` filter) couldn't leak
data. Adopting it in a single PR is risky for this codebase because:

- **The app connects with one Postgres role**, not per-user. RLS expects a
  per-session principal (`SET LOCAL app.user_id = …`). Wiring that into
  `PrismaService` requires a connection-pool-aware middleware that runs on
  every request, plus a careful check that connection re-use across
  requests doesn't leak the previous user's `app.user_id`.
- **The Supabase service-role key bypasses RLS by definition.** Any code
  path that uses `SUPABASE_SERVICE_ROLE_KEY` (today: auth admin operations,
  some scheduled jobs) would also have to be audited so RLS is not silently
  defeated.
- **Cron / push jobs run as no user.** `PushSchedulerService` writes
  `push_logs` for every user in the system. Under RLS that job either
  needs an "system" exemption or to be split into per-user transactions,
  both of which are non-trivial.

The plan below stages the work so each step is shippable and reversible.

## RLS migration plan

The table list below is ordered by risk. Earliest tables are the simplest
shape (single `user_id` foreign key, no service-role writers). Later tables
have caveats that block a copy-paste rollout.

### Phase A — append-only ledgers (low-risk pilot)

| Table | Owner | Notes |
|---|---|---|
| `account_balance_logs` | `user_id` | Read-only after insert. `LogSource` includes `onboarding`/`eod_form` only. |
| `eod_submissions` | `user_id` | Already scoped end-to-end in `eod.service.ts`. |
| `habit_logs` | `user_id` | Append-mostly; updates only on the same day's row. |
| `ai_request_logs` | `user_id` | New in this PR. Counter-only; never read by another user. |
| `push_logs` | `user_id` | **Caveat**: written by `PushSchedulerService`, which runs on a single Fly VM. That writer needs the `service_role` exemption or the policy must allow inserts when `app.user_id IS NULL` (system path). |

Pilot policy template:

```sql
-- Run inside a manual migration after staging soak.
ALTER TABLE eod_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_self_select_eod
  ON eod_submissions
  FOR SELECT
  USING (
    user_id = current_setting('app.user_id', true)
    OR coalesce(current_setting('app.role', true), '') = 'owner'
    OR coalesce(current_setting('app.role', true), '') = 'service'
  );

CREATE POLICY tenant_self_write_eod
  ON eod_submissions
  FOR ALL
  USING (
    user_id = current_setting('app.user_id', true)
    OR coalesce(current_setting('app.role', true), '') = 'owner'
    OR coalesce(current_setting('app.role', true), '') = 'service'
  )
  WITH CHECK (
    user_id = current_setting('app.user_id', true)
    OR coalesce(current_setting('app.role', true), '') = 'owner'
    OR coalesce(current_setting('app.role', true), '') = 'service'
  );
```

The `app.user_id` and `app.role` GUCs are populated by a Prisma middleware
that runs `SET LOCAL app.user_id = $1, app.role = $2` at the start of each
request's transaction. The middleware also runs `RESET app.user_id, app.role`
on commit/rollback so a recycled pool connection can never inherit the
previous request's principal.

### Phase B — coach-keyed tables

| Table | Owner | Notes |
|---|---|---|
| `coach_notes` | `coach_id` (writer) + `user_id` (subject) | Both columns must be in the policy: a coach reads notes where `coach_id = current_user OR user_id = current_user`. |
| `program_templates` | `coach_id` | Single-key policy. Coach owns. |
| `coach_profiles` | `user_id` (= coach user) | Owner sees all; the coach themselves; coach's roster reads display-name fields only via a view. |

These need a *projection view* for read traffic so the policy doesn't
collide with the owner-bypass ergonomics. We'll ship the views in the same
migration that flips RLS on for these tables.

### Phase C — financial profile and accounts

`financial_profiles` and `financial_accounts` carry money. Flipping RLS
here is a one-way door — a misconfigured policy drops all reads. Plan:

1. Land Phase A; soak in production for at least one full week.
2. Add an integration test that asserts the JWT sub-claim mismatch case
   (user A's JWT, user B's row id in route param) returns 403, not 200,
   with RLS *enabled in CI* against a copy of the schema.
3. Then flip RLS on these tables behind a feature flag (`ENABLE_RLS_FINANCIAL`)
   so we can revert by toggling the flag rather than a `DROP POLICY`.

### Phase D — system tables

`users`, `notification_preferences`, `user_preferences`, and
`spending_dna_reports` come last. `users` in particular has policies that
must allow **owner**, **the user themselves**, and (for `coach_id`-linked
fields) the coach in the same row. These are the policies most likely to
have edge cases that only show up in production, so they're scheduled
after the pilot has caught any wiring issues.

## Operator runbook for the eventual flip

Each of the four phases above is a manual migration:

1. Prepare an SQL file under `prisma/migrations/<ts>_rls_phase_<a..d>/migration.sql`.
2. Test against a clone of production data:
   `pg_dump prod | psql staging` then run the migration; verify policies
   with `pg_policies` and run the integration test in step 3.
3. Run the **denial test suite** against staging — a small Node script
   that authenticates as user A and tries every cross-tenant combination
   we already have route-guard tests for. Any 200 from staging that should
   be a 403 = stop, do not ship.
4. Cut a deploy whose only change is the migration. Watch
   `/health/deep` (DB ping) and Sentry for the 30 minutes after the
   `release_command` finishes.
5. If anything regresses, run the rollback migration that drops the
   policies for that table.

## Status today

- HTTP layer: JwtAuthGuard + TenantGuard + OwnsStudentGuard + ClientCoachLinkedGuard.
- Service layer: `assertOwnsRecord` / `assertCoachOwnsRecord` / `scopeToSelf` / `scopeToCoach`.
- DB layer (RLS): not enabled. Migration plan and operator actions documented above.

The combination of HTTP + service layer is what protects production today.
RLS is an additional layer planned for after the policies and the
SET-LOCAL middleware have soaked behind a feature flag.

## Cross-app federation surface (`/api/admin/federation/*`)

The unified TGP admin console is hosted in the **fitness** backend; this
finance backend exposes a read-only federation surface that the console
fans into. The trust boundary for that surface is **not** the per-user
JWT — the fitness backend never has a finance-side user JWT to forward.
Instead:

- A new `ServiceTokenGuard` checks
  `Authorization: Bearer <FEDERATION_SERVICE_TOKEN>` with a
  constant-time comparison and a 32-char minimum on the env value.
- Routes are `@Public()` so the global `JwtAuthGuard` does not also
  attempt to verify a Supabase JWT.
- If `FEDERATION_SERVICE_TOKEN` is unset on the deployment, every
  federation request returns `503 FEDERATION_DISABLED`. An
  unconfigured deploy fails closed.
- The federation surface is read-only summaries (no per-account
  balances, no individual EOD text, no AI insight text). Any mutation
  goes through the user-JWT path on `/api/admin/*` (OWNER-gated).

Identity mapping between finance and fitness is **email-only**
(case-insensitive) today. Limitations and the planned migration to a
shared `shared_identity_id` are documented in
`backend/src/admin/README.md`.

Fitness-side admin routes still require an OWNER user JWT on the
fitness backend. The federation surface here is just the data
provider; access control on the console UI is enforced by the fitness
side.
