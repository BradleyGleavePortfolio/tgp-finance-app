# Auth

Bridges Supabase Auth (which owns email/password, Google OAuth, email
verification, and session refresh) to the application's role + tenancy
model. This module is the entry point for every authenticated request and
the home of the global guard chain.

## Files

- `auth.controller.ts` — `/api/auth/*` endpoints: `register`, `login`,
  `verify-email`, `google`, `select-role`, `logout`, `me`.
- `auth.service.ts` — talks to Supabase admin SDK; handles ghost-user
  cleanup, post-Supabase Prisma user creation, and the dev-only coach
  self-promotion backdoor (locked off in production).
- `strategies/jwt.strategy.ts` — Passport JWT strategy. Decodes the
  Supabase access token, hydrates `request.user` from the local DB.
- `guards/jwt.guard.ts` — registered globally; `@Public()` opts out.
- `guards/tenant.guard.ts` — registered globally; fail-closed multi-tenant
  isolation. Owners and coaches pass; students must own any `:userId`
  route param.
- `guards/role.guard.ts` — applied per controller via `@Roles(...)`.
  OWNER short-circuits to `true` for every role-gated route.
- `guards/owns-student.guard.ts` — verifies the route's student belongs to
  the calling coach (or that the caller is an OWNER).
- `guards/coach-owns-client.guard.ts` — naming alias for `OwnsStudentGuard`
  on new "client"-named routes; behavior identical.
- `guards/client-coach-linked.guard.ts` — Phase 1C gate: a `student` with
  no `coach_id` cannot use client-only routes when
  `FEATURE_REQUIRE_COACH_CODE=true`. Allowlists the linking flow.
- `scope.ts` — `scopeToCoach()` Prisma `where` helper. Owners get `{}`,
  coaches get `{ coach_id: user.id }`, anything else fails closed with a
  guaranteed-no-match filter.

## Data flow

1. Mobile signs the user in against Supabase (or via our backend
   `/api/auth/login`, which proxies to `signInWithPassword`).
2. Mobile sends `Authorization: Bearer <access_token>` to the backend.
3. The global `JwtAuthGuard` runs `JwtStrategy`, which:
   - validates the JWT against Supabase's JWKS,
   - looks up the local `users` row by `supabase_id`,
   - lazily creates the row if Google OAuth created the Supabase user
     before our backend ever saw them.
4. `TenantGuard` confirms the route is allowed for the user's role.
5. `ClientCoachLinkedGuard` enforces the Phase 1C "must be attached to a
   coach" rule when the feature flag is on.
6. `RoleGuard` (when present) checks `@Roles(...)`. OWNER bypasses.
7. The handler runs.

## Supabase integration details

- **Email verification is required.** `login` rejects unconfirmed
  accounts with `EMAIL_NOT_VERIFIED`.
- **Ghost users.** If Supabase has a record for an email but our DB
  doesn't, `register` deletes the orphaned Supabase user and retries.
  This hides the "email already registered" failure that used to surface
  when a previous registration attempt half-succeeded.
- **Google OAuth → coach attach.** Google sign-in creates the Supabase
  user before we see them; the backend creates a local `User` with
  `coach_id=null`. Such users must call `/api/invites/attach` with a
  valid coach code before they can use client-only routes (when the
  feature flag is on). See `invites/README.md`.
- **Coach role promotion.** `select-role` only grants `coach` if BOTH
  `ENABLE_DEV_BACKDOOR=true` and `NODE_ENV != 'production'` and a
  matching `COACH_ACCESS_CODE` is supplied. In production this endpoint
  is effectively read-only for the role field; the supported promotion
  path is `AdminController.promote` (OWNER only).

## Security & tenancy

The default for every route in the app is "JWT required + same-tenant
data only." Removing a `@UseGuards` decorator can no longer accidentally
publish a private endpoint; only `@Public()` does that. Any new route
that needs to be unauthenticated must justify the decorator.

`scope.ts::scopeToCoach` is the canonical way to add coach-scoping to a
list query:

```ts
const where = { ...scopeToCoach(user), role: 'student' };
```

For non-list endpoints (a coach acting on one student), use
`OwnsStudentGuard` at the route layer plus
`assertCoachOwnsStudent` at the service layer (defense in depth).

## Environment variables

| Key | Used by | Notes |
|-----|---------|-------|
| `SUPABASE_URL` | service + strategy | Required; auth fails without it. |
| `SUPABASE_SERVICE_ROLE_KEY` | service | Required for `admin.createUser` etc. |
| `SUPABASE_ANON_KEY` | strategy | Used by the JWKS verifier path. |
| `JWT_SECRET` | `main.ts` boot check | 32+ chars; no fallback. |
| `ENABLE_DEV_BACKDOOR` | service | Must be `true` AND non-prod for `select-role` coach grant. |
| `COACH_ACCESS_CODE` | service | Only consulted when the backdoor is enabled. |
| `FEATURE_REQUIRE_COACH_CODE` | `register` + `ClientCoachLinkedGuard` | Phase 1C gate. |

## Failure modes

- **Missing Supabase env at boot** — service constructor logs a warning;
  every auth endpoint returns 400 / 500 on use. Non-auth routes still
  function (e.g. running migrations, scripts).
- **Stale Supabase JWT** — `JwtAuthGuard` returns 401. The mobile
  `services/api.ts` interceptor coalesces concurrent 401s into a single
  refresh call.
- **Coach code attempt in production** — `select-role` returns 403
  `COACH_SELF_REGISTRATION_DISABLED`. Use the admin promote endpoint.
- **Ghost-user retry storm** — bounded to one delete + one re-create per
  registration; if both fail we surface Supabase's error verbatim.
- **`Roles` decorator missing on a coach-only route** — `RoleGuard`
  returns `true` (no required roles), which means the route is reachable
  by any authenticated user. Always pair `RoleGuard` with `@Roles(...)`.

## Tests

- `backend/test/role.guard.spec.ts` — owner-bypass + role enforcement.
- `backend/test/tenant.guard.spec.ts` — fail-closed without `request.user`.
- `backend/test/owns-student.guard.spec.ts` — coach roster + owner
  bypass; route param extraction.
- `backend/test/scope.spec.ts` — owner-empty / coach-scoped /
  unauthenticated-no-match.

## Operations

- Supabase Service Role Key rotation: update the env var, redeploy. There
  is no in-process cache to flush.
- The dev backdoor MUST stay off in production — set `ENABLE_DEV_BACKDOOR`
  unset or `false`. Both the env check and the `NODE_ENV` check must pass
  for it to engage; either one off is enough to disable it.
- After deploying the Phase 1C gate, `FEATURE_REQUIRE_COACH_CODE` should
  be turned on in staging first, then production. Existing students
  already have `coach_id` set; the gate only catches *future* unattached
  signups (Google OAuth without an invite code).
