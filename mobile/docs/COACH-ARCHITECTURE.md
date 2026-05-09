# Coach Operating System — architecture (Stage 2)

System overview, data flow, and the route → service → store map for
the finance app's Coach module.

## Pillar model

| Pillar          | App path                                  | Coach maturity |
|---              |---                                        |---|
| Body (fitness)  | `growth-project-mobile` / `mobile/`       | 18+ coach screens, Stage 0 (mature) |
| Wealth (finance)| `tgp-finance-app/mobile/`                 | 11 coach screens, Stage 2 (this) |
| Mind            | not yet                                   | — |

The **Practice Model** decides which app a coach uses based on which
pillars they serve clients in:

- **Finance-only coach** → finance app + finance promotions.
- **Fitness-only coach** → fitness app.
- **Both pillars coach** → fitness app is the host. The cross-pillar
  view lives at `Settings → Both pillars view` in the fitness coach
  module. Stage 2 ships a designed preview of this surface
  (`mobile/src/screens/coach/BothPillarsScreen.tsx` in the fitness
  repo). Stage 3 wires the federated roster fetch.

## Data flow (single round-trip pattern)

The hot screens (`/coach/index.tsx`, `/coach/clients/[id]/index.tsx`,
`/coach/analytics/index.tsx`) each hit one aggregation endpoint that
the backend assembles from multiple Prisma queries in `Promise.all`.
Reasoning:

1. Mobile pays one TLS handshake + one auth refresh, not 4–8.
2. The dashboard would otherwise need 5 sequential reads
   (clients, alerts, EOD feed, milestones, assignments).
3. The Stage 2 SLA budget for `GET /coach/dashboard` is 350 ms p95
   on a 100-client roster. The aggregation easily meets that on the
   roster sizes we see (median 12, p95 86 in pilot data).

When a coach selects a tab inside `ClientDetail`, the per-tab fetch
is **lazy** — it only fires on the first activation. Subsequent
returns to the same tab read the cached state in component-local
state. The pull-to-refresh handler explicitly re-fetches the active
tab (and the summary header).

## Route map (mobile/app/coach/)

```
/coach                                 → CoachHome dashboard
/coach/clients                         → ClientsList (EHR-style)
/coach/clients/[id]                    → ClientDetail (tabbed)
/coach/clients/[id]/notes              → Notes editor
/coach/clients/[id]/assignments        → Assignments CRUD
/coach/messages                        → Inbox
/coach/messages/[clientId]             → Thread
/coach/community                       → Community posts list
/coach/community/new                   → Compose post
/coach/analytics                       → Practice KPIs
/coach/settings                        → Coach profile + app settings
```

Plus the legacy `/coach/student/[id]` from the pre-Stage 2 single
screen, kept mounted for any deep-links that may still exist.

## API surface

Every endpoint is under `api/coach/*` and gated by:
- `JwtAuthGuard` (user must be authenticated)
- `RoleGuard` with `@Roles('coach')` (`student` rejected)
- Per-route `OwnsStudentGuard` on every client-scoped path

Owner bypass is universal: `role==='owner'` skips the ownership
check at both the route layer (`OwnsStudentGuard`) and the service
layer (`assertCoachOwnsStudent` short-circuits when `role==='owner'`).

### Read endpoints

```
GET /api/coach/dashboard              → CoachDashboardResponse
GET /api/coach/clients                → { clients: CoachClientRow[]; total: number }
GET /api/coach/analytics              → PracticeAnalytics
GET /api/coach/messages               → { threads: CoachMessageThreadRow[] }
GET /api/coach/community/posts        → CommunityPostRow[]

GET /api/coach/clients/:id/summary    → CoachClientSummary
GET /api/coach/clients/:id/accounts   → CoachClientAccountRow[]
GET /api/coach/clients/:id/cashflow   → CoachClientCashflow
GET /api/coach/clients/:id/goals      → CoachClientGoals
GET /api/coach/clients/:id/notes      → CoachNoteRow[]
GET /api/coach/clients/:id/assignments→ ClientAssignmentRow[]
GET /api/coach/clients/:id/messages   → CoachMessageThread
```

### Write endpoints

```
POST  /api/coach/clients/:id/assignments      → ClientAssignmentRow
POST  /api/coach/clients/:id/messages         → CoachMessageRow
POST  /api/coach/notes/:student_id            → CoachNoteRow
POST  /api/coach/community/posts              → CommunityPostRow

PATCH /api/coach/notes/:note_id               → CoachNoteRow
PATCH /api/coach/assignments/:assignment_id   → ClientAssignmentRow
PATCH /api/coach/community/posts/:post_id     → CommunityPostRow

DELETE /api/coach/notes/:note_id              → { ok: true }
DELETE /api/coach/assignments/:assignment_id  → { ok: true }
DELETE /api/coach/community/posts/:post_id    → { ok: true }
```

Stage 1 endpoints (`/students`, `/students/:id`, `/alerts`,
`/digest`, `/templates`, `/templates/:id/apply/:student_id`) are
unchanged.

## Database

Three new Prisma models in
`backend/prisma/migrations/20260509000000_coach_os_stage2`:

| Model            | Purpose | Hot read path |
|---               |---      |---|
| `ClientAssignment` | Coach-defined task / challenge for a client | `(client_id, status)` for client view; `(coach_id, created_at desc)` for coach view |
| `CoachMessage`     | Durable chat row with deterministic `thread_key` (sorted pair `<a>:<b>`) | `(thread_key, created_at)` for thread; `(recipient_id, read_at)` for unread count |
| `CommunityPost`    | Coach-authored content (title + body + optional URL) | `(author_id, status, published_at desc)` for the list |

Pre-existing models we read from: `User`, `FinancialProfile`,
`FinancialAccount`, `EODSubmission`, `MilestoneUnlock`,
`HabitLog`, `CoachNote`, `ProgramTemplate`.

## Type contract

All API contract types live in `mobile/src/types/coach.ts`. Backend
controller methods declare typed return shapes that match. A drift
between them fails the `mobile/src/types/__tests__/coach.test.ts`
spec at compile time.

## Auth scoping

`backend/src/auth/scope.ts` exports `scopeToCoach(user, field)` —
returns `{}` for owner, `{ coach_id: user.id }` for a coach. This
is the single source of truth for "this user can read this row."
Every read endpoint uses it; every write endpoint additionally
calls `assertCoachOwnsStudent`.

## Known limitations (Stage 2)

1. **No real-time delivery for messages.** Coaches re-fetch the
   thread on pull-to-refresh. Stage 3 wires websockets + push
   fan-out.
2. **`getCoachClients` sorts in-memory** (the wealth_velocity_score
   and net_worth ranks aren't natively sortable in Prisma). For
   rosters >500, materialise to a `roster_summary` table that the
   nightly job rebuilds.
3. **Inbox unread count is computed in-memory** (Map + reduce over
   recent messages). Same reasoning as #2 — fine at our scale, not
   forever.
4. **Coach branding / payment links / calendar are stubs** in
   `coach/settings/index.tsx`. The Stage 3 implementation is its
   own track.

## File-level test coverage

| Layer    | Test file                                                | Specs |
|---       |---                                                       |---:|
| Backend  | `backend/test/coach.service.spec.ts` (existing)          | 3 |
| Backend  | `backend/test/coach-stage2.service.spec.ts` (new)        | 14 |
| Mobile   | `mobile/src/types/__tests__/coach.test.ts` (new)         | 6 |

The new specs cover the lift-up areas: enum + sort + filter logic in
`getCoachClients`, ownership + Decimal handling in
`createAssignment`, `updateAssignment` denying a non-owning coach,
owner-bypass on `updateAssignment`, `threadKey` order-independence,
read-marking on `getCoachMessageThread`, `published_at` semantics
on `updateCommunityPost`, and the analytics rollup.

## Stage 3 watchlist

When you start Stage 3:

1. Replace `STUB_CLIENTS` in
   `mobile/src/screens/coach/BothPillarsScreen.tsx` (fitness repo)
   with a fetch against the new federated roster endpoint.
2. Add websocket support to `coach.module.ts` and update
   `coach/messages/[clientId].tsx` to subscribe.
3. Build the Stripe / Cal.com integrations behind feature flags
   in `coach/settings/index.tsx` (the rows are already disabled
   placeholders).
4. Ship a sparkline component for the CoachHome stat tiles using
   the `EODSubmission` history we already store.
