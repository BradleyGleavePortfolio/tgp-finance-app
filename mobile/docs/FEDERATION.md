# Federation — Stage-3 architecture

## TL;DR

There are two TGP backends — `tgp-finance-app/backend/` (Wealth) and
`gpb/` (Body) — and one human can hold one identity across both. Stage 3
**did not** introduce a new federation pipe; it extended the existing
service-token federation that Stages 0–2 already shipped, and added a
coach-facing entry point on top of it.

```
Wealth coach app (mobile, finance)
        │
        ▼
 PUT /api/coach/practice  ────────►  finance backend  (storage only)
                                              │
                                              ▼
                                 (Prisma `coach_practice_type` column)


Body coach app (mobile, growth-project-mobile)
        │
        ▼
 PUT /api/coach/practice  ────►  gpb backend  (storage + practice gate)
        │
        ▼
 GET /api/coach/cross-pillar/* ─►  gpb / coach / cross-pillar
                                   │
                                   ├── FederationService (admin/federation/) — unchanged
                                   │   └── FinanceAdminClient ─┐
                                   │                            │ FEDERATION_SERVICE_TOKEN
                                   │                            ▼
                                   │              tgp-finance-api / api/admin/federation/*
                                   └── coach-scoped Prisma read of THIS coach's roster
```

The coach-facing surface (`/api/coach/cross-pillar/*`) is a new **thin
wrapper**. Orchestration is the same `FederationService` the OWNER admin
console already uses; the wrapper just changes the auth (JWT + Coach +
practice='both') and bounds the roster to the calling coach.

## Why we chose to extend, not duplicate

Three pieces of prior art made the choice:

1. **`tgp-finance-app/backend/src/admin/federation/` already implements
   the inbound side** — search, by-email client lookup, by-email coach
   lookup, product usage, all gated by `ServiceTokenGuard`. The token,
   timing-safe compare, fail-closed-on-unset behaviour, and email-keyed
   identity were already production-quality.
2. **`gpb/src/admin/federation/` already implements the outbound side**
   — `FinanceAdminClient` (with retry + timeout), unified search +
   client + coach orchestration via `FederationService`, and even an
   inbound PTM-signal channel from the finance backend. All of that is
   tested and OWNER-gated.
3. **Email is already the join key.** Both backends store user email
   uniquely; the federation layer's `identityMapping: 'email'` value is
   echoed in the health-check contract so any caller can detect the
   limitation. A `tgp_identity_id` UUID on top of this would have
   delivered nothing the email join doesn't already do, and would have
   forced a four-way migration (two databases × two backfill scripts).

So: **email stays the identity key**. When a durable shared identity
provider lands (likely Supabase user-id surfaced into both backends, in
a future stage), we add `account_id` alongside `email`, prefer it, and
keep email as a fallback. The contracts here already carry an
`account_id?: string | null` slot so that swap is invisible to callers.

## What Stage 3 added on top

### gpb (fitness backend)

```
src/coach/cross-pillar/
  cross-pillar.controller.ts          GET /api/coach/cross-pillar/{analytics,clients,clients/:id,search}
  cross-pillar.service.ts             coach-scoped roster + reuses FederationService
  cross-pillar-practice.guard.ts      enforces practice_type == 'both'
src/coach/practice-type/
  practice-type.controller.ts         GET/PUT /api/coach/practice
  practice-type.service.ts            persists CoachPracticeType
prisma/migrations/20260509120000_coach_practice_type_stage3/
```

### finance backend

```
src/coach/practice-type/
  practice-type.controller.ts         GET/PUT /api/coach/practice
  practice-type.service.ts            persists CoachPracticeType
prisma/migrations/20260509000001_coach_practice_type_stage3/
```

### fitness mobile

```
src/types/crossPillar.ts                     wire contracts
src/services/api.ts                          crossPillarApi + practiceTypeApi
src/hooks/useDebouncedValue.ts               200 ms debounce primitive
src/lib/recentClients.ts                     local recently-viewed cache
src/components/coach/UniversalClientSearch.tsx  reusable EHR-style picker
src/screens/coach/cross-pillar/
  CrossPillarNavigator.tsx                   nested stack with practice-selection gate
  PracticeSelectionScreen.tsx
  CrossPillarHomeScreen.tsx
  CrossPillarClientsListScreen.tsx
  CrossPillarClientDetailScreen.tsx
  CrossPillarMessagesScreen.tsx
  CrossPillarAssignmentsScreen.tsx
src/navigation/CoachNavigator.tsx            BothPillars route now hosts the navigator
```

## Auth model

Three audiences, three guard chains, one `FederationService`:

| Surface | Path | Guard chain | Identity |
| --- | --- | --- | --- |
| OWNER admin console | `gpb /admin/federation/*` | JwtAuthGuard + RolesGuard('owner') | calling owner's JWT |
| Cross-product service | `tgp-finance-api /api/admin/federation/*` | ServiceTokenGuard | `FEDERATION_SERVICE_TOKEN` (gpb → finance) |
| **Coach (Stage 3)** | `gpb /api/coach/cross-pillar/*` | JwtAuthGuard + CoachGuard + CrossPillarPracticeGuard | calling coach's JWT, gated on `coach_practice_type === 'both'` |
| Practice picker | `gpb /api/coach/practice`, `tgp-finance-api /api/coach/practice` | JwtAuthGuard + CoachGuard | calling coach's JWT |

## Environment variables (Fly)

Stage 3 introduces zero new env vars on either backend. The same
`FEDERATION_SERVICE_TOKEN` (set during the OWNER federation rollout) is
now ALSO the auth that the coach cross-pillar surface uses for its
server-to-server fan-out, because:

- gpb's `FinanceAdminClient` reads `FEDERATION_SERVICE_TOKEN` from the
  process env.
- The same value is used for the inbound PTM signal channel
  (`finance-backend → gpb /api/admin/federation/ptm-signal` uses
  `FINANCE_SERVICE_TOKEN`).
- Both must be set on each backend's Fly app:

```bash
# Set on the finance Fly app (tgp-finance-api)
fly secrets set FEDERATION_SERVICE_TOKEN=<32+ char value> --app tgp-finance-api

# Set on the fitness Fly app (gpb — current name backend-spring-lake-3890)
fly secrets set FEDERATION_SERVICE_TOKEN=<same 32+ char value> --app backend-spring-lake-3890
fly secrets set FINANCE_SERVICE_TOKEN=<same 32+ char value> --app backend-spring-lake-3890
fly secrets set FINANCE_API_BASE_URL=https://tgp-finance-api.fly.dev --app backend-spring-lake-3890
```

The token must be **at least 32 characters** (the `ServiceTokenGuard`
rejects shorter values before any compare). The two Fly apps must hold
the same value — a mismatch surfaces as a 401
`FEDERATION_UNAUTHENTICATED` from gpb's perspective when it tries to
reach finance. Generation idea: `openssl rand -hex 32`.

## Limitations (documented intentionally)

- **Email-keyed identity.** A user who signs up to the two products
  with different emails is two records to the federation layer. There
  is no SSO yet. The mobile cross-pillar UI surfaces this explicitly
  in the dashboard footer.
- **Roster floor is fitness.** `getClients` on `/api/coach/cross-pillar`
  iterates the calling coach's *fitness* clients and fans out to
  finance for each. A client who is finance-only with the same coach
  (no fitness account at all) will not appear. A coach-scoped finance
  roster query is Stage 3.5 work.
- **Combined messaging is not federated.** The Body and Wealth coach
  apps each keep their own message stores; the cross-pillar Messages
  screen surfaces the Body inbox count and a deep link into the
  Wealth coach app for finance threads. A unified message wire is
  Stage 3.5.
- **Combined assignments is not federated.** Same reason — assignments
  are per-product. The cross-pillar Assignments screen renders the
  roster and lets the coach drill into per-pillar lists from the
  Both-tab on `CrossPillarClientDetail`.
