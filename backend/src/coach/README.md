# Coach

The coach-facing surface: roster, alerts, per-client detail, the Phase
1B client summary used by messaging UI, weekly digest, and program
templates. Every endpoint here is gated by `JwtAuthGuard + RoleGuard`
with `@Roles('coach')`. OWNER is allowed everywhere by virtue of the
RoleGuard short-circuit, plus an explicit owner branch in each service
method that returns cross-tenant data.

## Files

- `coach.controller.ts` — `/api/coach/*` routes.
- `coach.service.ts` — roster, client summary, student detail with
  history, alerts, notes, weekly digest, program templates.
- `coach.module.ts` — registers the controller + service.

## Endpoints

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/coach/students` | Coach's roster (owner sees all). Optional `?search=` does a case-insensitive email contains. |
| GET | `/api/coach/clients/:id/summary` | Phase 1B summary for messaging UI. Guarded by `OwnsStudentGuard`. |
| GET | `/api/coach/students/:id` | Single-student detail (profile + recent EODs + accounts + notes). |
| GET | `/api/coach/students/:id/detail?days=90` | Long-form: profile + accounts + EODs + computed `net_worth_history` + `weekly_rollups` + milestones + notes. |
| GET | `/api/coach/alerts` | Per-coach alerts: missed-checkin and low-velocity students. |
| POST | `/api/coach/notes/:student_id` | Create a note. Service-layer check confirms ownership before write. |
| GET | `/api/coach/digest` | This week's roll-up: submission rate, top performers, needs-attention list. |
| GET | `/api/coach/templates` | Coach's program templates. |
| POST | `/api/coach/templates` | Create one. |
| POST | `/api/coach/templates/:id/apply/:student_id` | Apply a template to a student. Bumps `current_priority_index`, writes a coach note. |

## Phase 1B `clientSummary`

Used by the coach messaging surface so the coach has context before/while
they message a client. Returns enough structured data to render a
messaging sidebar without hitting the long-form detail endpoint:

- **`client`** — id, name, email, role, coach_id.
- **`profile`** — full FinancialProfile (priority index, streaks, dream,
  income).
- **`account_totals`** — derived from current `FinancialAccount.balance`
  values (assets / debt / cash / net_worth).
- **`recent_eods`** — last 14 EOD submissions, only the metric fields
  (date, net_worth, debt, assets, mood). No raw `account_snapshots`
  payload.
- **`habit_logs`** — last 14 days of habit completions.
- **`milestones`** — last 10 unlocks.

Owner bypass is honored via the `role` parameter passed from the
controller. The `assertCoachOwnsStudent` private helper re-checks
ownership inside the service for defense in depth — `OwnsStudentGuard`
enforces it at the route layer first.

## Data flow & derivations

- `getStudents` annotates each row with `submitted_today` (computed by
  comparing `last_eod_date` to the UTC date string today) and
  `red_flags: []` (a placeholder kept for the mobile UI; live alerts come
  from `getAlerts`).
- `getStudentDetailWithHistory` builds `weekly_rollups` by grouping
  EOD submissions on `weekStart = Sunday-of-the-week`. Each rollup
  carries `submissions_count`, `avg_net_worth`, `avg_debt`, `avg_assets`.
- `getAlerts` flags two conditions:
  - **missed_checkin** — no EOD in 3+ days; severity = `high` past 7
    days, otherwise `medium`. Surfaces "unknown" for clients who have
    never submitted.
  - **low_velocity** — `wealth_velocity_score < 20`, severity `low`.
- `applyTemplate` writes a coach note documenting the template name +
  description so the audit trail in `clientSummary.recent_notes` is
  human-readable.

## Security & tenancy

- Ownership is enforced **twice**: at the route layer via
  `OwnsStudentGuard` and at the service layer via the private
  `assertCoachOwnsStudent`. A missed guard on a new route still fails
  closed.
- Owner bypass is explicit: every roster query branches on `role` and
  returns the cross-tenant view when `role === 'owner'`.
- `getStudents` uses `scopeToCoach(user)` indirectly via the explicit
  branch — coaches see `coach_id === user.id` rows only.
- Coach notes are filtered to the calling coach's own notes for non-
  owners; owners see every note for the student so the admin view is
  complete.
- The pairing endpoint lives under `accountability/`, not here, but it
  shares the same ownership check — see that module's README for the
  cross-tenant fix.

## Environment variables

None unique to this module. Inherits from `auth/`.

## Failure modes

| Code | When |
|------|------|
| `NOT_YOUR_STUDENT` | Coach tries to act on a student outside their roster (single error shape across "doesn't exist", "wrong role", "wrong coach" so attackers can't probe by ID). |
| `NOT_FOUND` | Owner / template lookup hit nothing. |
| `FORBIDDEN` | Service-layer ownership check failed. |
| `VALIDATION_ERROR` | Zod schema rejection from `CreateCoachNoteSchema` / `CreateProgramTemplateSchema`. |

## Tests

`backend/test/coach.service.spec.ts` covers:

- owner-bypass on `getStudents` (returns rows from multiple coaches)
- coach scoping (only own students)
- `assertCoachOwnsStudent` rejects cross-tenant
- weekly rollup computation
- `applyTemplate` writes a coach note + bumps priority

## Operations

- Roster pagination is currently absent — the mobile app pulls the full
  list. Coaches with hundreds of clients should expect to see a future
  paginated variant; the `clientSummary` endpoint already exists so the
  expensive long-form detail is only fetched on demand.
- The `red_flags: []` field returned by `getStudents` is a placeholder
  for inline alerts. Today the source of truth is `getAlerts`. If you
  add a per-student red flag list, populate it in the same `map` to
  avoid an extra round trip.
- The `getAlerts` 3-day / 7-day thresholds are tuned for the daily
  cadence product; if the cadence ever loosens (e.g. weekly check-ins),
  bump them in lock-step with the EOD reminder cron.
