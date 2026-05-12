# The Growth Project: Finance

A multi-tenant financial coaching and accountability platform. The app
pairs a daily check-in with a long-running record of net worth, cash
flow, debt, and a coach-curated set of priorities. It is read-only —
it observes balances, it does not move money.

The product is built around three ideas: a complete view of where the
money is, a daily artefact of progress against it, and a clear
account of how long the work to financial independence will take. The
register is editorial and quiet by design; see
[`mobile/DESIGN.md`](mobile/DESIGN.md) for the full doctrine.

Part of The Growth Project coaching ecosystem
(thegrowthproject.courses).

## Tech Stack
- Frontend: React Native + Expo SDK 51+ (TypeScript, Expo Router, Zustand)
- Backend: Node.js + NestJS (TypeScript)
- Database: PostgreSQL + Prisma ORM (v5.22)
- Auth: Supabase Auth (email/password + Google OAuth)
- AI Coach: Perplexity sonar-pro (backend-proxied, 20 req/user/hr,
  DB-backed sliding-window rate limit, voice doctrine pinned by test)
- Charts: react-native-gifted-charts
- Validation: Zod (shared frontend + backend)

## Where this app sits in the TGP product

The Growth Project ships two backend products that share a single
admin console. The console is hosted in the **fitness** backend; the
**finance** backend (this repo) exposes a read-only federation surface
the console fans into so an admin can see real cross-app data instead
of an unconfigured empty state.

- The unified admin console lives in the fitness backend. Its routes
  are OWNER-gated by user JWT.
- This finance backend exposes two admin layers:
  - `/api/admin/*` — OWNER-only (user JWT + `RoleGuard`). Promote
    users into `coach` / `owner`, list the coach roster, run the
    finance bridge endpoints the console needs to render coach +
    client summaries.
  - `/api/admin/federation/*` — service-token gated. The fitness
    backend presents `Authorization: Bearer
    <FEDERATION_SERVICE_TOKEN>`. If the env var is unset on a
    deployment, every federation request returns
    `503 FEDERATION_DISABLED` so an unconfigured deploy cannot
    silently expose the surface.
- Identity mapping between the two backends is **email-only**
  (case-insensitive) today. Every federation response surfaces
  `identityMapping: 'email'` so the console can warn on one-sided
  matches. A shared `shared_identity_id` is the long-term plan; the
  email path will remain as a fallback.

Full module-level doc lives at
[`backend/src/admin/README.md`](backend/src/admin/README.md).

## Prerequisites
- Node.js 20+ (required)
- PostgreSQL 15+ (via Supabase or local install)
- Expo CLI (`npx expo` — included with Expo SDK)
- npm (comes with Node.js)

## Quick Start (Windows / Mac / Linux)

```bash
# 1. Unzip and enter the project
unzip tgp-finance.zip
cd tgp-finance

# 2. Create your .env file in the PROJECT ROOT (tgp-finance/.env)
#    ⚠️  The .env file MUST be in the root tgp-finance/ folder, NOT in backend/
cp .env.example .env

# 3. Fill in your API keys in .env (see "API Keys" section below)

# 4. Install all dependencies (root + backend + mobile)
npm run install:all

# 5. Run Prisma migrations (creates database tables)
#    NOTE: migrations are now required — `backend/prisma/migrations/` is checked in.
#    Use `npm run migrate` for dev (creates new migrations from schema changes) or
#    `npm run migrate:deploy` in production (applies committed migrations only).
npm run migrate

# 6. Seed demo data
npm run seed

# 7. Start development servers (backend on port 3000 + Expo)
npm run dev
```

## ⚠️ IMPORTANT: .env File Location

Your `.env` file **MUST** be in the project root directory:

```
tgp-finance/
├── .env              ← HERE (project root)
├── .env.example
├── package.json
├── backend/
│   ├── package.json
│   ├── prisma/
│   └── src/
├── mobile/
│   ├── package.json
│   └── ...
├── data/
│   └── cost_of_living_2026.json
├── scripts/
│   └── seed.ts
└── README.md
```

Do **NOT** put `.env` inside `backend/` or `mobile/`. The backend is configured to read from the project root.

## Environment Variables

Fill these in your root `.env` file. **Required** keys must be set or the backend will refuse to start.

| Key | Required | Where to get it / notes |
|-----|----------|-------------------------|
| `DATABASE_URL` | ✅ | Supabase dashboard → Settings → Database → Connection String (URI format) |
| `SUPABASE_URL` | ✅ | Supabase dashboard → Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | ✅ | Supabase dashboard → Settings → API → `anon` public key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase dashboard → Settings → API → `service_role` secret key |
| `JWT_SECRET` | ✅ | Generate with: `openssl rand -hex 32` (32+ char random string). No fallback. |
| `CORS_ORIGINS` | ✅ (prod) | Comma-separated list of allowed origins (e.g. `https://app.example.com,https://staging.example.com`). Required in production. |
| `COACH_ACCESS_CODE` | ✅ | Secret code coaches enter during role selection. Rotate from the `.env.example` placeholder before deploying. |
| `PERPLEXITY_API_KEY` | ✅ | perplexity.ai → Settings → API → Generate Key |
| `GOOGLE_CLIENT_ID_*` | optional | console.cloud.google.com → Credentials → OAuth 2.0 (off by default in the mobile app) |
| `NUMBEO_API_KEY` | optional | numbeo.com/api (fallback data is bundled in `data/cost_of_living_2026.json`) |
| `FEDERATION_SERVICE_TOKEN` | optional | Shared bearer that gates `/api/admin/federation/*`. Generate with `openssl rand -hex 32`; must be ≥ 32 chars. Unset means the federation surface is disabled and every request returns `503 FEDERATION_DISABLED`. The same secret must also be set on the fitness backend so it can present the bearer. |
| `SUPPORT_CONTACT_EMAIL` | optional | Override for the concierge support address surfaced on the Trust Center and the access-status endpoint. Defaults to `support@thegrowthproject.courses`. |
| `ENABLE_SWAGGER` | optional | In non-production, Swagger UI mounts at `/api/docs` unconditionally. In production, mount it only when this is `true` (JSON spec at `/api/docs-json`). |
| `RELEASE_SHA`, `RELEASE_NAME` | optional | Surfaced by `/system/release-info`. Falls back to Fly runtime envs and `package.json#version`. |
| `EXPO_ACCESS_TOKEN` | optional | Push sender uses default Expo rate limits when unset. |
| `SENTRY_DSN` | optional | Errors are not forwarded to Sentry when unset. |
| `POSTHOG_KEY` | optional | `analytics.capture` is a no-op when unset. |

The **mobile** app also requires two public (`EXPO_PUBLIC_*`) env vars. Put them in `mobile/.env` or your Expo config:

| Key | Required | Notes |
|-----|----------|-------|
| `EXPO_PUBLIC_SUPABASE_URL` | ✅ | Same project URL as the backend's `SUPABASE_URL`. No hardcoded fallback — the app throws on startup if missing. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon key. Safe to ship in the client, but required explicitly. |
| `EXPO_PUBLIC_API_URL` | optional | Override for the backend base URL (defaults to `http://localhost:3000`). |

## Individual Commands

| Command | What it does |
|---------|-------------|
| `npm run install:all` | Installs root, backend, and mobile dependencies |
| `npm run dev` | Starts backend (port 3000) + Expo simultaneously |
| `npm run dev:backend` | Starts only the NestJS backend in watch mode |
| `npm run dev:mobile` | Starts only the Expo dev server |
| `npm run migrate` | Runs Prisma migrations on your database |
| `npm run seed` | Seeds demo coach + student with 30 days of data |
| `npm run build:backend` | Compiles backend TypeScript to `backend/dist/` |
| `npm run prisma:studio` | Opens Prisma Studio (visual DB browser) |
| `npm run prisma:generate` | Regenerates Prisma client (run after schema changes) |
| `npm run typecheck` | Runs TypeScript check on backend (zero errors expected) |

## Demo Accounts
- Coach: `coach@tgp-finance.demo` / `Demo1234!`
- Student: `student@tgp-finance.demo` / `Demo1234!`

Coach role is granted by an administrator out-of-band. For local development only, a
self-promotion backdoor is available behind an env flag — set `ENABLE_DEV_BACKDOOR=true`
and a valid `COACH_ACCESS_CODE` (see `.env.example`). **Never set this flag in production.**
Rotate `COACH_ACCESS_CODE` before shipping; do not reuse the example value.

## Troubleshooting

### "supabaseUrl is required" error
Your `.env` file is either missing or in the wrong location. It must be at `tgp-finance/.env` (project root), not inside `backend/`.

### Prisma client errors / "Property does not exist on type PrismaService"
Run `npm run prisma:generate` from the project root. This regenerates the Prisma client based on your schema. This runs automatically during `npm install` in the backend.

### "expo: command not found"
Make sure you ran `npm run install:all` (which installs mobile deps including Expo). Then use `npx expo start` or `npm run dev:mobile`.

### TypeScript compile errors
Run `npm run typecheck` to see exact errors. The project should compile with zero errors out of the box.

### Port 3000 already in use
Kill the existing process or set `PORT=3001` in your `.env` file.

### Windows-specific: "The term 'cd' is not recognized"
Use Command Prompt or Git Bash instead of PowerShell, or run commands individually:
```bash
# Instead of npm run install:all, run each separately:
npm install
cd backend && npm install
cd ../mobile && npm install
```

## What is in the app

The surfaces below are present and wired end-to-end. None of these
are placeholders.

- **Net worth.** Recomputed after every end-of-day submission;
  history is preserved.
- **Financial vital signs.** Four live metrics: net worth, cash
  flow, debt-to-income, savings rate.
- **Wealth Velocity Score.** 0–100, with seven named levels.
- **Interest Bleed.** A quiet "daily interest cost" detail page,
  showing the daily interest paid across debt accounts. The legacy
  pulsing red live ticker on the home screen was removed in the
  sale-readiness pass — the figure now lives on a dedicated detail
  screen with no anxiety framing.
- **End-of-day check-in.** Streak tracking and an AI insight per
  submission.
- **Priority Waterfall.** Seven levels, auto-advancing as the
  underlying math changes.
- **What-If scenarios.** Twelve runners covering debt payment,
  income increase, relocating across thirty-plus countries, expense
  cuts, lump-sum investing, asset sales, starting a business, early
  debt payoff, salary negotiation, tax optimisation, and early
  retirement.
- **Net-worth projections.** Interactive sliders on top of the live
  vital signs.
- **Debt strategies.** Avalanche and snowball, side by side.
- **AI coach.** Backed by Perplexity sonar-pro. The system prompt is
  declarative and editorial — voice rules mirror `mobile/DESIGN.md`
  §5 (no emoji, no hype, no audience framing, numbers over
  adjectives). Pinned by `backend/test/ai-prompt-doctrine.spec.ts`.
- **Milestones.** Fifteen unlock criteria across cash, debt, net
  worth, streak, and income — surfaced quietly, never with confetti.
- **Payday deploy** flow.
- **Income gap analyser** and **tax burden estimator**
  (2026 federal plus all fifty state brackets).
- **Future-self letter.** Written at onboarding, delivered at day
  ninety.
- **Spending DNA.** A monthly AI report of behavioural patterns.
- **Coach dashboard.** Red flags, student timeline, program
  templates.
- **Accountability pairing.** Streaks and scores are visible to a
  partner; balances are not.
- **Spending habits.** Five daily mini-habits.
- **Onboarding quiz.** Sixteen questions across five phases.

## Extending
- Add What-If scenario: Add to `ScenarioType` enum in `prisma/schema.prisma` → handler in `whatif.service.ts` → UI in `mobile/app/whatif/`
- Update cost-of-living: Replace `data/cost_of_living_2026.json`

## CI & Tests

GitHub Actions runs on every pull request and push to `main` (`.github/workflows/ci.yml`):

- **backend** — `npm ci`, lint, `tsc --noEmit`, `npm run build`, `npm test`
- **mobile** — `npm ci`, `tsc --noEmit`, `npm test`

Local test runs:

```bash
cd backend && npm test
cd mobile  && npm test
```

The backend suite includes the doctrine pins:

- `test/ai-prompt-doctrine.spec.ts` — the AI system-prompt voice
  rules (no emoji, no audience framing, no "FP" persona, no
  15-example block, voice-rule keywords present).
- `test/system-trust-meta.spec.ts` — Trust Center capability flags
  must match what the backend actually implements end-to-end, plus
  the `SUPPORT_CONTACT_EMAIL` fallback.
- `test/users-controller.spec.ts`, `test/users-access-status.spec.ts`
  — concierge-handoff payload and the membership-card surface.
- `test/admin-federation.guard.spec.ts`,
  `test/admin-federation.service.spec.ts`,
  `test/admin-federation.controller.spec.ts` — federation surface
  auth + shaping + URL-decoding (PR #93).
- `test/admin-finance-bridge.spec.ts` — finance bridge endpoints
  the unified admin console reads (PR #92).

Dependabot (`.github/workflows`) opens weekly grouped minor/patch update PRs for `backend/`, `mobile/`, and the workflows themselves.

## Operator actions

These are the operator steps required when the corresponding feature
ships — not on every deploy.

- **Federation surface** (`/api/admin/federation/*`):
  1. Generate a 32-character token: `openssl rand -hex 32`.
  2. `flyctl secrets set FEDERATION_SERVICE_TOKEN=<value> -a tgp-finance-api`.
  3. Set the same value on the fitness backend so it can present the
     bearer.
  4. Smoke-check:
     `curl -H "Authorization: Bearer $FEDERATION_SERVICE_TOKEN"
     https://tgp-finance-api.fly.dev/api/admin/federation/health`
     returns `{ ok: true, identityMapping: 'email', ... }`.
  5. Without the bearer, the same request must return
     `401 FEDERATION_UNAUTHENTICATED`. With the env var unset, every
     request must return `503 FEDERATION_DISABLED`.
- **Promoting the first owner**: there is no bootstrap endpoint by
  design. Promote in the database directly (`UPDATE users SET role =
  'owner' WHERE email = '...';`) once. After that, `POST /api/admin/promote`
  handles all subsequent promotions.
- **Disabling a coach**: set `coach_profiles.is_active = false`
  directly. `register` and `attach` fail closed against an inactive
  code. There is no demote endpoint yet; client-roster reassignment
  is a manual DB operation.
- **Concierge data-controls inbox**: set `SUPPORT_CONTACT_EMAIL` to a
  routed alias before the Trust Center is shipped to a real
  audience. The mobile UI surfaces the address verbatim. There is
  intentionally no automated export / deletion pipeline; that lands
  with its own controller and migration when the schema work is
  approved.

## Production Deploy (Fly.io)

The backend deploys via `fly.toml` in `backend/`. Database migrations are wired
into the release process and run automatically on every deploy, before new VMs
start:

```toml
[deploy]
  release_command = 'bash ./scripts/release.sh'
```

Fly runs this in a temporary VM with the app's secrets (`DATABASE_URL`, etc.)
injected. The script wraps `prisma migrate deploy` with a baseline-recovery
fallback (P3005/P3009/P3018) — see `backend/docs/DEPLOY.md` and
`backend/scripts/release.sh`. It is invoked via `bash` (not `sh`) because
Fly's release-VM `/bin/sh` is dash, which rejects the script's `set -euo
pipefail`. If the migration fails for a non-baseline reason, the release is
aborted and no traffic is shifted. The `prisma` CLI is bundled into the
production image for this purpose (see `backend/Dockerfile`).

To author a new migration locally:

```bash
cd backend
npx prisma migrate dev --name <descriptive_name>
git add prisma/migrations
```

Do **not** commit the auto-generated `prisma/migrations` shadow DB.

## Design doctrine

The app's visual and editorial register is documented in
[`mobile/DESIGN.md`](mobile/DESIGN.md). The short version: bone, ink,
and oxblood; Cormorant Garamond for display, Inter for body; no
emoji, no gamification, no placeholder copy in shipped UI. New code
that adds a colour, a fake value, a `TODO` marker, or a confetti
animation is expected to fail review on doctrine grounds.

The doctrine extends to backend-rendered copy and to the AI coach.
The chat, EOD-insight, and Spending DNA system prompts share the §5
voice rules and are pinned by
`backend/test/ai-prompt-doctrine.spec.ts` (no emoji, no audience
framing, no "FP" persona, no 15-example sales-funnel block,
voice-rule keywords present). Trust Center capability flags are
pinned by `backend/test/system-trust-meta.spec.ts` and must reflect
what the backend actually implements end-to-end — flipping a flag
without shipping the feature is a sale-readiness regression.

## Documentation rule — every PR updates a README

Every PR that touches a backend module or a mobile feature must
update the matching `README.md` (or `mobile/DESIGN.md`, the theme
README, or the appropriate `backend/docs/*.md` for cross-cutting
ops / tenancy / federation work). README staleness has bitten this
codebase before, so the rule is enforced as a review-gate rather than
a soft convention:

- A new endpoint → its module README's endpoint table updates in the
  same PR.
- A new env var → both `.env.example` and the env tables in this
  README, the backend README, and the affected module README update
  in the same PR.
- A capability change (e.g. flipping a Trust Center flag, swapping
  the AI provider) → the README *and* the pinning test update in the
  same PR.
- Removed code → README references to it removed in the same PR.
  Tombstones (`// removed`, "deprecated", "coming soon") are not a
  substitute.

Module-level READMEs all share the same shape: purpose, key files,
endpoints, data flow, security/tenancy, env vars, failure modes,
tests, operations. Match the shape when adding a new one.

## Disclaimer

This app provides financial education and tracking tools for
informational purposes only. Nothing in this app constitutes
financial, tax, or investment advice. Consult a licensed financial
professional before making financial decisions.

---

## Workflows (May 9 verification)

| Workflow | Purpose |
|---|---|
| `.github/workflows/ci.yml` — backend | `npm ci`, lint, `tsc --noEmit`, `npm run build`, `npm test` |
| `.github/workflows/ci.yml` — mobile | `npm ci`, `tsc --noEmit`, `npm test` |
| Dependabot | Weekly grouped minor / patch update PRs for `backend/`, `mobile/`, and the workflows themselves |
| Fly release pipeline | `release_command = bash ./scripts/release.sh` runs `prisma migrate deploy` with baseline-recovery fallback in a release-VM before traffic flips |
| EAS build (mobile) | `eas build --platform <ios|android> --profile production` — see `EAS-BUILD.md` |

## Architecture

```
Mobile (Expo) -- HTTPS --> Fly.io edge --> NestJS app (tgp-finance-api)
                                                |
                                                +-- Prisma 5 --> Supabase Postgres
                                                +-- Supabase Auth JWKS (token verify)
                                                +-- Perplexity sonar-pro (AI coach, DB-backed sliding-window rate limit)
                                                +-- Federation surface (/api/admin/federation/*)
                                                       gated by FEDERATION_SERVICE_TOKEN
                                                +-- USDA / Numbeo (cost of living fallback bundled)

Fitness backend (backend-spring-lake-3890)
    | presents Bearer FEDERATION_SERVICE_TOKEN
    +-- /api/admin/federation/* on tgp-finance-api
            (email-based identity mapping today;
             shared_identity_id is the long-term plan)
```

## Known issues (May 9 — open audit findings)

| ID | Issue | Severity | Status |
|---|---|---|---|
| 1 | No coach-side invite-code screen — coaches cannot add their first client | Stop-the-press | Sprint A Fix 1 in flight |
| 2 | "I'm a Coach" returns 403 in production due to the dev-backdoor gate | Stop-the-press | Sprint A Fix 2 in flight (deep-link token flow) |
| 3 | `PracticeSelectionScreen` invisible plus asymmetric write across pillars | Stop-the-press | Sprint A Fix 3 in flight (first-run gate plus symmetric dual write) |
| 4 | `flyctl deploy --remote-only` known-degraded — see RUNBOOK.md for diagnostic steps | High | Tracked; manual `--local-only` works |

## Roadmap

| Item | T-shirt | Notes |
|---|---|---|
| Sprint A — three stop-the-press fixes plus signup polish | M | Branch `feat/sprint-a-stop-the-press` |
| Cross-pillar `shared_identity_id` (replaces email-based identity mapping fallback) | L | Coordinated with fitness backend |
| Concierge data-controls inbox automation | L | Currently `SUPPORT_CONTACT_EMAIL` only — no automated export / deletion pipeline yet |
| Demote-coach endpoint plus client-roster reassignment | M | Currently a manual DB operation |
| Stripe billing for finance pillar | L | Not yet wired (fitness pillar handles SaaS billing today) |
| Reverse-migration audit across recent waves | S | Confirm down-migrations exist for Stage 3 schema |

## Contribution guide

- Branch naming: `feat/<scope>-<topic>`, `fix/<scope>-<topic>`, `docs/<topic>`. Sprints use `feat/sprint-<letter>-<theme>`.
- Conventional commits: `feat(scope): subject`, `fix(scope): subject`. No emoji. No exclamation points. (House style. The pre-existing copy in this README does not yet conform — fold into a future cleanup sweep, not into unrelated PRs.)
- Strict TypeScript — no `any`, no `@ts-ignore`. CI rejects either.
- Theme tokens only on the mobile side. Bone, ink, and oxblood per `mobile/DESIGN.md`. Cormorant Garamond for display, Inter for body.
- Every PR updates the matching README or module README. Module-level READMEs share the same shape: purpose, key files, endpoints, data flow, security / tenancy, env vars, failure modes, tests, operations.
- Endpoints touching coach role require rate limiting plus audit logging.
- AI prompts are pinned by `backend/test/ai-prompt-doctrine.spec.ts`. Trust Center capability flags are pinned by `backend/test/system-trust-meta.spec.ts` — flipping a flag without shipping the feature is a regression.
- Bradley merges. Do not self-merge.

## Sprint A audit fixes

GPT-5.5 ran two POV audits on the post-Sprint-A merge state — one as
a client, one as a coach. Both scored 71/100 with verdict DO NOT SHIP.
The audits live at `/home/user/workspace/audit_client_pov.md` and
`/home/user/workspace/audit_coach_pov.md` (in-repo at deploy time).

This branch closes every blocker and high-priority item the audits
flagged on the finance side. Commits are conventional and additive
— no force-pushes, no history rewrite.

### What shipped

| Audit ID | Blocker | Where the fix landed |
|---|---|---|
| **CR-2** | Finance password-reset deep link broken end to end. Supabase recovery email sent users to `tgp-finance://auth/reset-password` but no route handled it. | `mobile/app/auth/reset-password.tsx` (new), `mobile/app/_layout.tsx` (forwards the deep link), `mobile/src/lib/parseRecoveryFragment.ts` (pure parser, 8 unit tests). |
| **CR-3** | Finance app had no client-side surface to read coach messages. The notification preferences advertised the feature but no read screen or endpoint existed. | `backend/src/messages/{module,controller,service}.ts` (new module + 13 unit tests), `mobile/app/messages/index.tsx` (new screen), `mobile/app/(tabs)/profile.tsx` (entry row), `mobile/src/services/api.ts` (`messagesApi`). |
| **CR-5** | Five "Coming in Stage 3" disabled rows in coach Settings contradicted the decacorn quality bar. | `mobile/app/coach/settings/index.tsx` removes the rows; they return when the underlying flows ship. |
| **CR-6** | Practice picker on finance silently produced asymmetric state — wrote only locally and left fitness `coach_practice_type` null. | `mobile/src/services/fitnessApi.ts` (new) calls fitness `PUT /api/coach/practice?propagate=false` with the user's Supabase JWT. `mobile/app/coach/practice/index.tsx` dual-writes, surfaces the same `couldn't sync your practice` 503 copy the fitness side uses, adds a back button + skip-and-configure-later link. 8 unit tests. |
| **H-3** | EOD page used `useState<any>` in violation of strict-TS doctrine. | `mobile/src/services/api.ts` adds typed `EODSubmissionResponse` + `EODSubmissionRow`. `mobile/app/eod/index.tsx` consumes the typed shape. `mobile/src/stores/eodStore.ts` normalises the wire shape into the legacy local type so consumers do not break. |
| **M-4** | Finance forgot-password used `Alert.alert` for the error path; the rest of the auth surface uses inline field errors. | `mobile/app/(auth)/login.tsx` swaps the Alert for `setFieldErrors`. |
| **Coach #5** | Finance coach client list was unpaginated and post-filtered in JS — memory-bound on 100+ clients. | `backend/src/coach/coach.service.ts` adds DB-layer status WHERE + Prisma orderBy + cursor pagination (`take: limit + 1`, max 50). `backend/src/coach/coach.controller.ts` accepts `limit` + `cursor`. `encodeRosterCursor` / `decodeRosterCursor` use a `v1:` prefix for forward compat. 6 unit tests. |
| **Coach #7** | `coach_promotion_audits` had no retention or pruning. | `backend/src/auth/coach-promotion-audit.scheduler.ts` runs nightly at 03:15 UTC. Success rows kept indefinitely (compliance). `already_coach` kept 365 days. Other failure outcomes kept 90 days. `RUNBOOK.md` documents the policy + manual-prune hook. 3 unit tests. |
| **Coach #13** | Misconfigured `FEDERATION_SERVICE_TOKEN` was silent — federation calls returned 503 / auth_unconfigured but ops had no boot-time signal. | `backend/src/system/federation-token-self-check.ts` runs on `OnModuleInit`, logs three states (`ok` / `too_short` / `unset`) with the exact `fly secrets set` command to fix. 5 unit tests. |
| **Coach #17** | Finance picker did not special-case 503 PRACTICE_FEDERATION_FAILED. | Covered by CR-6 — the picker maps `kind: 'degraded'` to the same `couldn't sync` retry copy the fitness side uses. |

### Not in scope (fitness repo)

The audits also flagged Coach #9 (cross-pillar Wealth deep link
silent failure) and Coach #11 (`BothPillarsScreen` stub still
mountable). Both files live in `growth-project-mobile`, not in this
repo. They are handled by the parallel fitness PRs (#128, #189).

### Tests added

| Suite | Count | File |
|---|---|---|
| Recovery URL fragment parser | 8 | `mobile/src/lib/__tests__/parseRecoveryFragment.test.ts` |
| Client-side messages service | 13 | `backend/test/messages.service.spec.ts` |
| Fitness federation client | 8 | `mobile/src/services/__tests__/fitnessApi.test.ts` |
| Coach client cursor pagination | 6 | `backend/test/coach-clients-cursor.spec.ts` |
| Coach promotion audit retention | 3 | `backend/test/coach-promotion-audit-scheduler.spec.ts` |
| Federation token self-check | 5 | `backend/test/federation-token-self-check.spec.ts` |
| **Total new** | **43** | |

Backend full suite: 294 / 294 passing. Mobile full suite: 97 / 97
passing. `npx tsc --noEmit` clean on both. `npx prisma validate` clean.

### Federation token preflight (Coach #13 details)

On every backend boot, `FederationTokenSelfCheck.runCheck` logs one
of three lines (search Fly logs after a deploy):

- `federation token configured (N chars). Cross-pillar federation
  receive surface is enabled.` — the normal path.
- `FEDERATION_SERVICE_TOKEN is unset — federation will return 503
  FEDERATION_DISABLED.` — set with
  `fly secrets set FEDERATION_SERVICE_TOKEN=$(openssl rand -hex 32)`
  on this app.
- `FEDERATION_SERVICE_TOKEN is too short (N chars; expected at least
  32).` — rotate the secret on both backends.

Both backends (fitness `growth-project-backend` and finance
`tgp-finance-app/backend`) must agree on the same secret value.
The fitness side reads it as `FINANCE_SERVICE_TOKEN`; this is the
same secret, just a different variable name on each side.

### Coach promotion audit retention policy (Coach #7 details)

`coach_promotion_audits` is the append-only log of every coach
self-promotion attempt. Sprint A added the table; this branch adds
nightly retention so an attacker with persistence cannot grow it
unbounded. Retention rules:

| Outcome | Retention | Rationale |
|---|---|---|
| `success` | indefinite | Compliance / audit trail. |
| `already_coach` | 365 days | Idempotent re-promote noise. |
| `invalid_token`, `invalid_role`, `rate_limited`, others | 90 days | Failure-mode signal value decays. |

The scheduler runs at 03:15 UTC; counts of pruned rows are logged
on every run. `RUNBOOK.md` covers manual invocation if a one-off
cleanup is ever needed.

## Operator Fill-Ins Required

Operator-action checklist for the finance launch. All backend secrets target the Fly app **`tgp-finance-api`**. Mobile secrets target the EAS project for the `tgp-finance` slug. Every `Used in (file:line)` row was verified by grep against `main` HEAD on 2026-05-12.

### Backend — TestFlight-blocking secrets (Fly app `tgp-finance-api`)

| Variable | Used in (file:line) | Where to set | How to generate / source |
|---|---|---|---|
| `DATABASE_URL` | `backend/src/common/env.ts:10` | Fly secret (app: `tgp-finance-api`) | Supabase dashboard → Settings → Database → Connection pooler (session mode). Include `?connection_limit=10&pool_timeout=10`. |
| `SUPABASE_URL` | `backend/src/common/env.ts:11` | Fly secret (app: `tgp-finance-api`) | Supabase dashboard → Settings → API → Project URL (same Supabase project the fitness backend uses). |
| `SUPABASE_SERVICE_ROLE_KEY` | `backend/src/common/env.ts:12` | Fly secret (app: `tgp-finance-api`) | Supabase dashboard → Settings → API → `service_role` key. Secret. |
| `JWT_SECRET` | `backend/src/common/env.ts:13` | Fly secret (app: `tgp-finance-api`) | 32-byte random hex: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Must be ≥16 chars; boot crashes otherwise (`backend/src/auth/auth.module.ts:24`). |
| `PERPLEXITY_API_KEY` | `backend/src/common/env.ts:14` | Fly secret (app: `tgp-finance-api`) | perplexity.ai → API. |
| `COACH_SIGNUP_SECRET` | `backend/src/auth/auth.service.ts:381` | Fly secret (app: `tgp-finance-api`) | 256-bit random hex. Must match the mobile `EXPO_PUBLIC_COACH_SIGNUP_SECRET` byte-for-byte (HMAC verification, `mobile/src/lib/coachSignupToken.ts:173`). |
| `FEDERATION_SERVICE_TOKEN` | `backend/src/system/federation-token-self-check.ts:29` | Fly secret (app: `tgp-finance-api`) | 256-bit random hex. Must match the fitness backend's `FINANCE_SERVICE_TOKEN` byte-for-byte. |
| `CORS_ORIGINS` | `backend/src/main.ts:36` | Fly secret (app: `tgp-finance-api`) | Comma-separated allow-list of origins. `*` is rejected. |
| `DIRECT_URL` | `backend/prisma/schema.prisma:11` | Fly secret (app: `tgp-finance-api`) | Supabase dashboard → Settings → Database → direct (non-pooler) URL on port 5432. Required for `prisma migrate deploy` at boot — pooled `DATABASE_URL` cannot run DDL. Landed in PR #131 on 2026-05-12. |

### Backend — production already-set (verify, do not introspect)

| Variable | Used in (file:line) | Where to set | How to generate / source |
|---|---|---|---|
| `SENTRY_DSN` | `backend/src/instrument.ts:6` | Fly secret (app: `tgp-finance-api`) | Sentry → finance project → Client Keys (DSN). VERIFY in Fly dashboard. |
| `POSTHOG_KEY` | `backend/src/analytics/analytics.service.ts:49` | Fly secret (app: `tgp-finance-api`) | PostHog → Project Settings → API Key. VERIFY in Fly dashboard. |
| `POSTHOG_HOST` | `backend/src/analytics/analytics.service.ts:58` | Fly secret (app: `tgp-finance-api`) | PostHog instance URL. VERIFY in Fly dashboard. |
| `EXPO_ACCESS_TOKEN` | `backend/src/push/push-sender.service.ts:33` | Fly secret (app: `tgp-finance-api`) | expo.dev → Settings → Access Tokens. Used to authenticate Expo push sends. VERIFY in Fly dashboard. |
| `SUPPORT_CONTACT_EMAIL` | `backend/src/users/users.service.ts:68` | Fly secret (app: `tgp-finance-api`) | Static string — operator's support inbox address. VERIFY in Fly dashboard. |
| `RELEASE_SHA` | `backend/src/system/release-info.ts:32` | Fly env (auto-set in fly.toml or deploy command) | Git SHA, auto-injected at build/deploy time. |
| `RELEASE_VERSION` | `backend/src/instrument.ts:12` | Fly env (auto-set in fly.toml or deploy command) | Semver tag for Sentry release. |

### Backend — feature flags (defaults documented; set only if changing)

| Variable | Used in (file:line) | Where to set | How to generate / source |
|---|---|---|---|
| `FEATURE_REQUIRE_COACH_CODE` | `backend/src/invites/invites.service.ts:49` | Fly secret (app: `tgp-finance-api`) | `true` (default) requires coach signup with a coach code. Leave unset for v1. |
| `ENABLE_SWAGGER` | `backend/src/main.ts:52` | Fly secret (app: `tgp-finance-api`) | `true` exposes Swagger at `/api/docs`. Leave unset in production. |
| `ENABLE_DEV_BACKDOOR` | `backend/src/common/env.ts:32` | Local `.env` only — NEVER in production | Forced off in production by an explicit env check. |

### Mobile — TestFlight-blocking EAS secrets

| Variable | Used in (file:line) | Where to set | How to generate / source |
|---|---|---|---|
| `EXPO_PUBLIC_API_URL` | `mobile/src/utils/constants.ts:236` | EAS secret (eas.json env block, profile `production`) | `https://tgp-finance-api.fly.dev`. Must include scheme; no trailing slash. |
| `EXPO_PUBLIC_SUPABASE_URL` | `mobile/src/services/supabase.ts:15` | EAS secret (eas.json env block, profile `production`) | Same Supabase Project URL as the backend. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `mobile/src/services/supabase.ts:16` | EAS secret (eas.json env block, profile `production`) | Supabase dashboard → Settings → API → `anon` public key. |
| `EXPO_PUBLIC_COACH_SIGNUP_SECRET` | `mobile/src/lib/coachSignupToken.ts:173` | EAS secret (eas.json env block, profile `production`) | Must match backend `COACH_SIGNUP_SECRET` byte-for-byte. |
| `EXPO_PUBLIC_ENVIRONMENT` | `mobile/src/services/sentry.ts:62` | EAS secret (eas.json env block, profile `production`) | Static string `production` for store builds. |
| `EXPO_PUBLIC_INVITE_BASE_URL` | `mobile/app/coach/invite-codes/index.tsx:32` | EAS secret (eas.json env block, profile `production`) | Public host base for invite deep links (e.g. `https://tgp-finance-api.fly.dev/invite`). |
| `EXPO_PUBLIC_POSTHOG_KEY` | `mobile/src/lib/analytics.ts:47` | EAS secret (eas.json env block, profile `production`) | PostHog → Project Settings → API Key (finance mobile project). |
| `EXPO_PUBLIC_POSTHOG_HOST` | `mobile/src/lib/analytics.ts:51` | EAS secret (eas.json env block, profile `production`) | PostHog instance URL. |
| `EXPO_PUBLIC_SENTRY_DSN` | `mobile/src/services/sentry.ts:42` | EAS secret (eas.json env block, profile `production`) | Sentry → finance mobile project → Client Keys (DSN). |
| `SENTRY_AUTH_TOKEN` | EAS build host (sourcemaps upload) | EAS account-level secret | Sentry → Settings → Auth Tokens → create with `project:releases` scope. |

### Currently set (verify, do not introspect)

```bash
# backend secrets
fly secrets list -a tgp-finance-api

# mobile EAS env
( cd mobile && npx eas-cli env:list --environment production )
```

### Active blocker

The Prisma direct-URL fix landed in PR #131 on 2026-05-12. Operator action: set the `DIRECT_URL` Fly secret (Supabase direct DB URL, port 5432, non-pooler) on `tgp-finance-api` before triggering the next deploy. Until that secret is set, `prisma migrate deploy` will continue to fail at release-command time and mobile builds remain blocked downstream.

Separate concern: `main` HEAD CI is currently red due to PR #129 (`@supabase/supabase-js` 2.105.1 → 2.105.4 + posthog-node 5.33 → 5.34) which introduced a Node 20 / `realtime-js` native-WebSocket regression in the test suite. This is a pre-existing condition that affects every branch including this docs PR; a follow-up will pin the supabase-js version or supply a `ws` transport.

## Open PRs by Status

Triage of open PRs as of 2026-05-12 (`gh pr list --state open --limit 100`).

### Bucket C: Future state

- **#112** Proof runtime scaffolding with coach signoff + AI guardrails. Trigger: when the proof-of-work feature ships.
- **#113** AI gateway provider-neutral seam with fail-closed config + provenance contracts. Trigger: when finance adopts the same AI gateway pattern as backend PR #194.

### Recently merged on `main` (out of scope for this triage)

- **#129** `backend-prod-dependencies` group bump (`@supabase/supabase-js` + `posthog-node`) — merged 2026-05-12; introduced a Node 20 / `realtime-js` WebSocket regression in tests.
- **#131** `fix(deploy)`: route `prisma migrate deploy` through `DIRECT_URL` — merged 2026-05-12; unblocks Fly release-command migrations once `DIRECT_URL` is set as a Fly secret.
