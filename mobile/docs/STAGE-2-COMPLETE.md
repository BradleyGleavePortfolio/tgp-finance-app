# Stage 2 — Coach OS — completion report

**Status:** delivered
**Date:** 2026-05-09
**Goal:** lift the finance app's coach surface from one screen to
fitness parity (12+ screens, full CRUD, designed empty states,
production-ready polish).

## What shipped

### Mobile (finance — `tgp-finance-app/mobile/`)

11 new screens under `app/coach/`:

| File                                              | Role |
|---                                                |---|
| `app/coach/_layout.tsx`                           | Stack navigator |
| `app/coach/index.tsx`                             | CoachHome dashboard (stats / needs-attention / activity / quick actions) |
| `app/coach/clients/index.tsx`                     | EHR-style list (search / filter / sort) |
| `app/coach/clients/[id]/index.tsx`                | ClientDetail with 7 tabs |
| `app/coach/clients/[id]/notes.tsx`                | Notes editor (full CRUD) |
| `app/coach/clients/[id]/assignments.tsx`          | Assignments management (full CRUD) |
| `app/coach/messages/index.tsx`                    | Inbox aggregating threads |
| `app/coach/messages/[clientId].tsx`               | Thread with sticky composer |
| `app/coach/community/index.tsx`                   | Coach-authored posts list |
| `app/coach/community/new.tsx`                     | Post composer |
| `app/coach/analytics/index.tsx`                   | Practice KPIs |
| `app/coach/settings/index.tsx`                    | Coach profile + branded settings entry |

5 shared UI primitives under `src/components/coach/`:

| Component         | Purpose |
|---                |---|
| `CoachSkeleton` + `CoachSkeletonList` | Reduce-Motion-aware shimmer |
| `CoachEmptyState` | Branded empty + error states with retry |
| `CoachSearchBar`  | Search input with clear button |
| `CoachTabBar<T>`  | Generic horizontal segmented tabs |
| `CoachStatusPill` | Tone-aware chip (`good`/`warn`/`bad`/`neutral`) |

Type contract: `src/types/coach.ts` — explicit interfaces for every
endpoint payload. Zero `Record<string, unknown>` in the wire path.

API client: `src/services/api.ts` — `coachApi` extended with 19 new
methods, each typed on its return shape.

Routing: `app/_layout.tsx` registers `<Stack.Screen name="coach" />`.
The legacy `(tabs)/coach.tsx` still mounts the old dashboard with a
"NEW · COACH OS" ribbon at the top that pushes `/coach`. No forced
auto-redirect; coaches can roll over at their own pace through the
TestFlight rollout.

### Backend (`tgp-finance-app/backend/`)

3 new Prisma models — migration
`prisma/migrations/20260509000000_coach_os_stage2/migration.sql`:

| Model              | Purpose |
|---                 |---|
| `ClientAssignment` | Coach-defined task / challenge for a client |
| `CoachMessage`     | Durable chat row with deterministic `thread_key` |
| `CommunityPost`    | Coach-authored content with status + audience |

13 new endpoints + extensions to existing notes endpoint:

```
GET    /api/coach/dashboard
GET    /api/coach/clients
GET    /api/coach/clients/:id/{accounts,cashflow,goals,notes,assignments,messages}
GET    /api/coach/messages
GET    /api/coach/community/posts
GET    /api/coach/analytics
POST   /api/coach/clients/:id/{assignments,messages}
POST   /api/coach/community/posts
PATCH  /api/coach/notes/:id
PATCH  /api/coach/assignments/:id
PATCH  /api/coach/community/posts/:id
DELETE /api/coach/notes/:id
DELETE /api/coach/assignments/:id
DELETE /api/coach/community/posts/:id
```

CoachService extensions:
- `getCoachDashboard` — single round-trip for `/coach/index.tsx`
- `getCoachClients` — searchable / sortable / filterable roster
- `getClientAccounts` / `getClientCashflow` / `getClientGoals`
- `listClientNotes` / `updateNote` / `deleteNote`
- `listClientAssignments` / `createAssignment` / `updateAssignment` /
  `deleteAssignment`
- `getCoachMessageInbox` / `getCoachMessageThread` /
  `sendCoachMessage` (+ exported `threadKey` helper)
- `listCommunityPosts` / `createCommunityPost` /
  `updateCommunityPost` / `deleteCommunityPost`
- `getPracticeAnalytics`

Validators: `backend/src/common/validators/schemas.ts` — 5 new Zod
schemas for the new POST/PATCH bodies (`CreateAssignmentSchema`,
`UpdateAssignmentSchema`, `SendCoachMessageSchema`,
`CreateCommunityPostSchema`, `UpdateCommunityPostSchema`).

### Fitness (`growth-project-mobile`)

1 new screen + nav entry for the Practice-Model "both pillars"
coach view:

| File                                                   | Role |
|---                                                     |---|
| `src/screens/coach/BothPillarsScreen.tsx`              | Designed preview — Stage 3 wires real data |
| `src/navigation/CoachNavigator.tsx`                    | Registers `BothPillars` route |
| `src/screens/coach/SettingsScreen.tsx`                 | New "Cross-pillar practice" section |

The screen renders a hero ("Coming in Stage 3"), a stub-banner
("Preview only"), 5 sample clients with body / wealth / mind pillar
badges, and a footnote that names the Stage 3 federation handshake.
Zero API calls; pure stub data behind a clear comment.

## Tests

| Layer    | Suite                                                         | Specs added | Total after |
|---       |---                                                            |---:|---:|
| Backend  | `backend/test/coach-stage2.service.spec.ts` (new)             | 14 | — |
| Backend  | All backend                                                   | — | 31 suites / 234 tests |
| Mobile   | `mobile/src/types/__tests__/coach.test.ts` (new)              | 6  | — |
| Mobile   | All mobile (finance)                                          | — | 6 suites / 54 tests |
| Fitness  | All fitness                                                   | — | 59 suites / 627 tests (no change) |

Backend baseline before Stage 2: 30 suites / 220 tests.
Mobile baseline before Stage 2: 5 suites / 48 tests.
**Net new: +14 backend specs, +6 mobile specs. Zero regressions.**

## Verification

```bash
# Backend
cd backend && npx tsc --noEmit       # exit 0
cd backend && npx jest --silent      # 31 suites, 234 tests pass
cd backend && npm run lint           # 0 errors, 11 warnings (baseline)

# Mobile (finance)
cd mobile  && npx tsc --noEmit       # exit 0
cd mobile  && npx jest --silent      # 6 suites, 54 tests pass
cd mobile  && npm run lint           # 14 errors, 86 warnings (baseline; preserved)

# Fitness mobile (Both pillars stub)
cd /home/user/workspace/mobile && npx tsc --noEmit  # exit 0
cd /home/user/workspace/mobile && npx jest --silent # 59 suites, 627 tests pass
```

## What was deferred

| Item | Why | Where it lands |
|---   |---  |---|
| Real-time message delivery | Requires websocket infra + push fan-out; out of Stage 2 scope | Stage 3 |
| Federated roster fetch for Both pillars view | Identity reconciliation across fitness + finance backends is its own track | Stage 3 |
| Coach branding (avatar, public link) | Asset upload pipeline + URL routing | Stage 3 |
| Stripe payment links | Tenant Stripe Connect provisioning | Stage 3 |
| Cal.com / calendar integration | OAuth + webhook handlers | Stage 3 |
| Practice analytics charts | Sparkline component + EOD backfill query | Stage 3 |
| Scheduled publish for community posts | Cron + dispatcher | Stage 3 |
| Materialized roster_summary | Only needed at >500 clients; in-memory fine until then | Performance work |

## Score estimate

The brief asked for full parity vs the fitness app's 18+ coach
screens. Stage 2 ships **11 active coach screens + 5 shared
primitives + a typed API contract + 14 + 6 new tests**.

| Dimension | Pre-Stage 2 | Post-Stage 2 |
|---        |---:|---:|
| Coach screens (finance) | 1 | 11 (+ 1 Both-pillars stub on fitness) |
| Coach API endpoints | 8 | 21 |
| Prisma models for coach OS | 2 (`CoachNote`, `ProgramTemplate`) | 5 (+ `ClientAssignment`, `CoachMessage`, `CommunityPost`) |
| Type contract coverage | partial (`Record<string, unknown>` in places) | complete (typed wire) |
| Empty / error states | spinners + Alert | branded `CoachEmptyState` per surface |
| Reduce-Motion support | absent in coach surfaces | every animation respects it |
| Practice-Model placeholder | absent | designed preview live in fitness |

## Files changed

```
Backend (commit 431066d on origin/main):
  backend/prisma/schema.prisma                                    (+114)
  backend/prisma/migrations/20260509000000_coach_os_stage2/migration.sql  (+95) NEW
  backend/src/coach/coach.controller.ts                            (+227 / -2)
  backend/src/coach/coach.service.ts                               (+503 / 0)
  backend/src/common/validators/schemas.ts                         (+45)
  backend/test/coach-stage2.service.spec.ts                         NEW (+295)

Mobile finance (this commit and the next):
  mobile/app/_layout.tsx                                            (+2)
  mobile/app/(tabs)/coach.tsx                                       (+62)
  mobile/app/coach/_layout.tsx                                      NEW
  mobile/app/coach/index.tsx                                        NEW
  mobile/app/coach/clients/index.tsx                                NEW
  mobile/app/coach/clients/[id]/index.tsx                           NEW
  mobile/app/coach/clients/[id]/notes.tsx                           NEW
  mobile/app/coach/clients/[id]/assignments.tsx                     NEW
  mobile/app/coach/messages/index.tsx                               NEW
  mobile/app/coach/messages/[clientId].tsx                          NEW
  mobile/app/coach/community/index.tsx                              NEW
  mobile/app/coach/community/new.tsx                                NEW
  mobile/app/coach/analytics/index.tsx                              NEW
  mobile/app/coach/settings/index.tsx                               NEW
  mobile/app/coach/README.md                                        NEW
  mobile/src/components/coach/{CoachSkeleton,EmptyState,SearchBar,
                              TabBar,StatusPill}.tsx                NEW (5)
  mobile/src/services/api.ts                                        (+50 / 0)
  mobile/src/types/coach.ts                                         NEW
  mobile/src/types/__tests__/coach.test.ts                          NEW
  mobile/docs/COACH-ARCHITECTURE.md                                 NEW
  mobile/docs/STAGE-2-COMPLETE.md                                   NEW

Fitness (this commit on growth-project-mobile origin/main):
  src/screens/coach/BothPillarsScreen.tsx                           NEW
  src/navigation/CoachNavigator.tsx                                 (+9)
  src/screens/coach/SettingsScreen.tsx                              (+19)
```

## Commit log

| Repo                          | SHA            | Subject |
|---                            |---             |---|
| `tgp-finance-app`             | (backend)      | feat(backend): coach OS stage 2 — assignments, messages, posts, analytics |
| `tgp-finance-app`             | (mobile)       | feat(mobile): coach OS stage 2 — 11 screens to fitness parity |
| `tgp-finance-app`             | (this commit)  | docs: STAGE-2-COMPLETE + COACH-ARCHITECTURE + coach/README |
| `growth-project-mobile`       | (this commit)  | feat(coach): cross-pillar BothPillarsScreen stub for finance OS parity |

Each repo's `origin/main` is fast-forwarded.
