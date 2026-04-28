# Backend (NestJS API)

The Growth Project: Finance API. NestJS 10 on Node 20, Prisma 5.22 against
PostgreSQL (Supabase managed), JWT auth bridged to Supabase Auth.

The API is the single source of truth for every dollar value rendered in the
mobile app. It owns the role model, the priority waterfall, the EOD ledger,
all derived metrics (net worth, velocity, savings rate), the AI coach proxy,
and the coach/owner administrative surface.

## Layout

```
src/
  app.module.ts          Wires every feature module + the global guard chain
  main.ts                Bootstrap (CORS, JWT_SECRET assertion, port binding)
  prisma/                PrismaService (singleton, $connect on init)
  auth/                  Supabase-backed login + JWT strategy + guards
  admin/                 OWNER-only promotion + coach roster + cross-app
                         federation surface for the unified admin console
  invites/               Coach invite codes + client attach flow (Phase 1C)
  users/                 Identity / founding-member / data export
  profile/               FinancialProfile read/write + total recompute
  accounts/              FinancialAccount CRUD + balance log writes
  eod/                   End-of-day submission, streak, velocity score
  networth/              Net-worth + cash-flow + interest-bleed roll-ups
  whatif/                12 financial scenarios w/ closed-form math
  projections/           Long-horizon projection helpers
  priorities/            7-step priority waterfall
  milestones/            22 unlockable milestones + push hooks
  costliving/            Numbeo + bundled fallback for relocation scenarios
  ai/                    Hosted-LLM proxy w/ user-context hydration
  coach/                 Coach roster, alerts, client summary, templates
  accountability/        Partner pairing (privacy-scoped)
  payday/                Paycheck deploy + saved templates
  onboarding/            Quiz → profile mapping
  notifications/         User notification preferences (CRUD)
  push/                  Expo push sender + cron scheduler + dedupe
  community/             Anonymized wins feed + reactions
  preferences/           UI / personalization preferences
  analytics/             PostHog wrapper (fire-and-forget capture)
  system/                Trust meta + ops endpoints
  health/                Public /health probe
  common/                Decorators, guards-shared, money helpers, filters
prisma/                  schema.prisma + checked-in migrations/
test/                    Jest specs (services + guards + interceptors)
```

Every feature directory has its own `README.md` with the same shape: purpose,
key files, data flow, security/tenancy, env vars, failure modes, tests, ops.

## Boot order and global guard chain

`src/app.module.ts` registers four global `APP_GUARD`s in order. The order
matters and is not arbitrary:

1. **ThrottlerGuard** — 100 req/min per IP. Cheap fail before any DB / auth
   work.
2. **JwtAuthGuard** — verifies the bearer token, populates `request.user`.
   Routes intentionally without auth opt out via `@Public()`. The model is
   *private by default*; a forgotten `@UseGuards` cannot accidentally publish a
   private route, because the global default is "JWT required."
3. **TenantGuard** — fail-closed. Owners and coaches pass; students must own
   the `:userId` route param if one is present.
4. **ClientCoachLinkedGuard** — Phase 1C source-of-truth gate. When
   `FEATURE_REQUIRE_COACH_CODE` is enabled, a `student` with no `coach_id`
   is forced to call `/api/invites/attach` before any client-only route will
   answer. Coaches, owners, `@Public()` routes, and a small allowlist
   (`/api/auth/me`, `/api/auth/logout`, `/api/auth/select-role`,
   `/api/invites/*`) bypass this guard.

Two response interceptors run after the handler:

1. **DecimalToNumberInterceptor** — walks the response and replaces every
   `Prisma.Decimal` with `Number`. Money columns are capped at
   `DECIMAL(14, 2)` (~$99T) which fits inside JS Number precision (2^53), so
   the conversion is lossless and keeps the mobile JSON shape unchanged after
   the Float→Decimal migration.
2. **TransformInterceptor** — wraps the body in `{ data, success, timestamp }`.
   The mobile API client unwraps this in its single response interceptor.

## Auth model in one paragraph

Supabase Auth owns email/password, email verification, Google OAuth, and
session refresh. Our DB has a `users` row keyed by `supabase_id`. On every
request, `JwtStrategy` validates the Supabase JWT and looks up (or lazily
creates) the local user. The local row carries the application role
(`student | coach | owner`) and the `coach_id` foreign key — Supabase has no
notion of either. Coach self-promotion is gated behind `ENABLE_DEV_BACKDOOR`
and is **never** enabled in production; the supported promotion path is
`AdminController.promote` (OWNER only).

## Money handling

- Stored as `DECIMAL(14, 2)` in Postgres (Prisma migration
  `20260423000001_money_fields_to_decimal`).
- Returned to clients as `number` via `DecimalToNumberInterceptor`.
- Inside services, use `toN(...)` from `common/money.ts` before arithmetic —
  Prisma surfaces `Decimal` instances and mixing them with `+`/`-` silently
  coerces to string concatenation.
- Aggregations in EOD / net-worth / velocity all run through `toN` so a stale
  Float-era code path can't reintroduce IEEE-754 drift.

## Environment variables

The authoritative required-env list lives in `src/main.ts:assertRequiredEnv` —
boot fails with `Missing required env vars: ...` if any of these are missing.
This table must stay in lockstep with that function.

Required (boot fails when missing):

| Key | Notes |
|-----|-------|
| `DATABASE_URL` | Postgres URI from Supabase Settings → Database. |
| `SUPABASE_URL` | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin key. Never ship to mobile. |
| `JWT_SECRET` | 32+ random chars (`openssl rand -hex 32`). No fallback. |
| `PERPLEXITY_API_KEY` | Upstream LLM key. Boot fails if missing. AI chat / EOD insight / Spending DNA all depend on it. |

Required in production specifically:

| Key | Notes |
|-----|-------|
| `CORS_ORIGINS` | Comma-separated allowlist. Defaults to local Expo origins outside production; must be set explicitly in production. |
| `SUPABASE_ANON_KEY` | Verifies anon-issued tokens. Not enforced at boot today, but auth flows assume it. |

Optional, feature-affecting:

| Key | Effect / behavior |
|-----|-------------------|
| `FEATURE_REQUIRE_COACH_CODE` | When unset, Phase 1C source-of-truth gate is off and codeless signups are allowed. |
| `ENABLE_DEV_BACKDOOR` | When unset / not `true`, coach self-promotion via access code is disabled (correct prod default). Setting it to `true` *with* `NODE_ENV=production` is rejected at boot. |
| `COACH_ACCESS_CODE` | **Only consulted** when `ENABLE_DEV_BACKDOOR=true` AND `NODE_ENV !== 'production'`. Setting it without the backdoor flag is a no-op — the flag, not the code, is the gate. |
| `ENABLE_SWAGGER` | In non-production, Swagger UI is mounted at `/api/docs` unconditionally. In production it is mounted only when this is `true` (JSON spec at `/api/docs-json`). |
| `RELEASE_SHA`, `RELEASE_NAME` | Surfaced by `/system/release-info`. Falls back to Fly runtime envs and `package.json#version` when unset. |
| `EXPO_ACCESS_TOKEN` | Push sender uses default Expo rate limits. |
| `NUMBEO_API_KEY` | Cost-of-living scenarios fall back to bundled JSON. |
| `SENTRY_DSN` | Errors are not forwarded to Sentry. |
| `POSTHOG_KEY` | `analytics.capture` is a no-op. |
| `FEDERATION_SERVICE_TOKEN` | Required to enable `/api/admin/federation/*`. ≥ 32 chars. Unset → every federation request returns `503 FEDERATION_DISABLED`. The fitness backend must present the same secret as `Authorization: Bearer …`. See `src/admin/README.md` and `docs/TENANCY.md`. |
| `SUPPORT_CONTACT_EMAIL` | Override for the concierge support address surfaced on `/system/trust-meta` and `/users/me/access-status`. Defaults to `support@thegrowthproject.courses`. |

The root project `.env` file is loaded by `ConfigModule.forRoot` with an
explicit `envFilePath` two directories up — do **not** put a `.env` inside
`backend/` or it will be ignored.

## Running

```
npm install                    # at the repo root, installs all workspaces
npm run migrate:deploy         # applies prisma/migrations against $DATABASE_URL
npm run -w backend start:dev   # nest --watch on :3000
npm run -w backend test        # jest (services + guards + interceptors)
```

The first deploy against an existing production database needs:

```
npx prisma migrate resolve --applied 20260423000000_baseline
```

See `prisma/migrations/README.md` for the full baseline / deploy story.

## Deploying to Fly.io

Production runs on Fly (`tgp-finance-api`, `sjc`). The `.github/workflows/
deploy-backend.yml` workflow runs typecheck, tests, and an env gate before
calling `flyctl deploy --remote-only`. The same image can be built locally:

```
flyctl deploy --app tgp-finance-api          # from backend/, picks up fly.toml
docker build -t tgp-finance-api .            # local-only, same Dockerfile
```

**Dockerfile + Prisma quirk worth knowing.** `package.json` has
`postinstall: prisma generate`, and the `prisma` CLI lives in
`devDependencies`. The production stage installs with `--omit=dev`, so a
plain `npm ci --omit=dev` would invoke `postinstall` *before* the CLI
exists in that layer and fail with `sh: 1: prisma: not found`. The
Dockerfile therefore:

1. Runs both stages with `npm ci ... --ignore-scripts` so npm never
   triggers `postinstall` against an incomplete tree.
2. In the production stage, installs the Prisma CLI as a pinned
   no-save dep (`prisma@5.22.0`, mirrored from `devDependencies`) so
   the runtime image still has `prisma migrate deploy` available for
   `fly.toml` `release_command` (`scripts/release.sh`).
3. Drives `prisma generate` explicitly with `npx --no-install prisma
   generate` once the CLI is on disk.

If you bump `prisma` in `devDependencies`, update the pinned line in
`backend/Dockerfile` to match — the comment block at the top of the file
calls this out.

## Failure modes worth knowing

- **Boot without `JWT_SECRET`** — `main.ts` throws and the process exits.
- **Boot without Supabase keys** — auth routes return 500/400; everything
  else still works. The `AuthService` constructor logs a warning rather than
  crashing so unrelated work (running migrations, scripts) still functions.
- **AI rate limit (20/hr/user)** — counted in `ai_request_logs` (Postgres),
  so the budget survives VM restarts and is correct under multi-VM scale-out.
  Implementation in `src/ai/ai-rate-limit.service.ts`. Diagnostics endpoint:
  `GET /api/ai/rate-limit` returns `{ limit, used, remaining, window_seconds }`
  for the calling user without consuming a request.
- **Fly.io single-VM scheduling assumption** — `ScheduleModule` runs the EOD
  push cron in-process. With multiple VMs every VM would fire it. The
  `push.module.ts` README has the migration plan.

## Tests

`backend/test/` contains spec files for the highest-risk surfaces:

- `eod.service.spec.ts` — transaction integrity, duplicate guard, velocity
- `coach.service.spec.ts` — owner-bypass, coach-roster scoping
- `accountability.service.spec.ts` — cross-tenant pair regression
- `invites.service.spec.ts` — code preview/attach + already-attached cases
- `networth.service.spec.ts` — savings rate after the AccountType fix
- `owns-student.guard.spec.ts`, `tenant.guard.spec.ts`, `role.guard.spec.ts`,
  `scope.spec.ts` — the security perimeter
- `transform.interceptor.spec.ts`, `decimal-to-number.interceptor.spec.ts` —
  response envelope + Decimal→Number behavior
- `push-sender.service.spec.ts`, `push-scheduler.service.spec.ts` — dedupe
  + cron behavior

Run with `npm run -w backend test` or `npm run -w backend test:cov`.
