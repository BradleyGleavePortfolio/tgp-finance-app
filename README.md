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

## Expansion roadmap

A living map of what is built, what is in flight, and what is planned.
Every entry below is either shipped on `main`, in a draft PR, or
explicitly future work. Nothing here is a placeholder feature in the
running app.

### Done / shipped on `main`

The "What is in the app" section above lists every end-to-end surface
that ships today. The recent enterprise-readiness pass added:

- DB-backed sliding-window AI rate limit, OpenAPI surface, tenancy
  guardrails, deploy CI (PR #88).
- Cross-app federation endpoints + service-token gating for the
  unified admin console (PR #93, paired with the finance bridge in
  PR #92).
- OWNER role, coach invites, and source-of-truth gating
  (`FEATURE_REQUIRE_COACH_CODE`) (PR #81).
- Decimal-aware money DTOs + Zod validation on EOD / payday /
  onboarding / account writes (PR #100).
- Sentry source-map upload + release identifier on every Fly deploy
  and the mobile app (PRs #101, #102).
- Trust Center capability flags pinned to what the backend actually
  implements end-to-end; AI prompt voice rules pinned by test
  (PR #91).
- Per-module README shape across `backend/src/*` and `mobile/src/*`
  with the same purpose / key files / endpoints / data flow /
  security / env vars / failure modes / tests / ops layout (PR #82),
  plus the cross-cutting doctrine + federation overview + the
  README-per-PR rule (PR #94).

### The Wave 1–10 model

The Growth Project's cross-repo work is grouped into ten waves.
Wave 1 is the enterprise-readiness pass already on `main`. Waves 2–4
land in the sister repos (`growth-project-backend`,
`growth-project-mobile`); the finance app **mirrors** their data
shapes read-only where required. Waves 5–10 land here as
documentation-only spec PRs first, then runtime PRs per surface.

The summary table below is the canonical living-status of finance-
side work. PR numbers and statuses are accurate as of 2026-05-01;
keep this table in lock-step with the open PR list.

| Wave | Owner | This repo's role | PRs | Status |
|---|---|---|---|---|
| 1 — Enterprise readiness | both | shipped | #88 #91 #92 #93 #100 #101 #102 #105 | ✅ on `main` |
| 2 — Sub-coach hierarchy | backend | mirrors `org_memberships` read-only | (cross-repo) | dep for Wave 5/8/9/10 runtime |
| 3 — Admin control room | backend | finance bridge endpoints | #92 (shipped), #93 (shipped) | ✅ on `main` |
| 4 — Mobile org mode | mobile | consumer of `/api/v1/org/:id/revenue/*` | (cross-repo) | dep for Wave 5 mobile |
| 5 — Sub-coach billing split | finance | spec is here | **#109** | DRAFT |
| 6 — Marketplace permission scopes | finance | finance-data scope model | **#111** | DRAFT |
| 7 — Discovery trust signals | finance | bucketed-only, outcome-claim filter | **#111** | DRAFT |
| 8 — Payout extensions (Connect, ledger, anti-fraud) | finance | the payout rail | **#110** | DRAFT |
| 9 — Storefront blocks + funnel + community privacy | finance | finance-aware blocks, money-shape scrubber | **#111** | DRAFT |
| 10 — Cross-product federation identity | finance | v1 email-only, v2 `shared_identity_id` reserved | **#111** | DRAFT |

Sibling delivery / commerce / community spec sets that compose with
the wave model:

- **Coach-led finance programs** — Draft PR
  [#106](https://github.com/BradleyGleavePortfolio/tgp-finance-app/pull/106).
  12 specs, ~4,576 lines under `docs/specs/coach-led-programs/`.
  Defines the *delivery* primitives — challenges, regimens,
  leaderboards, profile avatars, coach content boards, assignment
  contract, structured messaging progress, L1/L2/L3 entitlements,
  consumer-finance compliance boundary, rollout playbook. **Money
  never appears in a leaderboard or a community post.**
- **Finance one-stop-shop (storefront / marketplace)** — Draft PR
  [#108](https://github.com/BradleyGleavePortfolio/tgp-finance-app/pull/108).
  13 specs, ~4,625 lines under `docs/specs/storefront-marketplace/`.
  Defines the *commerce / discovery / community / events / rewards
  / copilot* layer that sits on top of #106. Whop-shape one-stop-
  shop in the TGP register: bone / ink / oxblood, no emoji, no
  gamification chrome, no outcome guarantees, redacted balances.

### Wave 5 — sub-coach billing split (PR [#109](https://github.com/BradleyGleavePortfolio/tgp-finance-app/pull/109))

Two billing flows for sub-coach orgs:

- **Flow A** — sub-coach has own Stripe Connect customer; charge
  lands directly.
- **Flow B** — head coach is the merchant; platform takes its fee;
  head coach's Stripe Connect account forwards the sub-coach's share
  via Transfer.

`docs/billing/` adds three docs (1,215 lines): the index/conventions
README, `sub-coach-billing-split-spec.md`, and
`finance-org-roll-ups.md`. Refund cascade has four strategies (default
`pro_rata` + three OWNER-only). Org MRR/ARR/cohort surfaces with
drilldown invariants. Daily reconciliation job at 02:00 UTC.

Cross-repo deps: Wave 2 backend `sub-coach-hierarchy.md`; this repo
PR #108 §02–§03.

### Wave 6 — app marketplace permission scopes (PR [#111](https://github.com/BradleyGleavePortfolio/tgp-finance-app/pull/111))

12 named, finely-scoped permissions on a closed enum
(`finance_scope`). Default-deny per `OWNER_DECISION
W6_PERMISSION_DEFAULT_NO`. Token TTL 60s; revoke takes effect within
that window. **No scope grants raw client balance.** Doctrine pin:
`marketplace-permission-scope.spec.ts`.

### Wave 7 — discovery trust signals (PR [#111](https://github.com/BradleyGleavePortfolio/tgp-finance-app/pull/111))

Closed enum of 8 signals (all bucketed). Editorial boost capped at
2.0× per `OWNER_DECISION W7_BOOST_CAP`. Outcome-claim filter shadows
every signal. **No outcome-derived signal enters the rank.** Doctrine
pin: `discovery-bucketed-signals.spec.ts`.

### Wave 8 — finance payout extensions (PR [#110](https://github.com/BradleyGleavePortfolio/tgp-finance-app/pull/110))

The payout rail under every Wave 5–10 money flow. 11-file spec set
(~3,217 lines) under `docs/specs/wave-8-payout-extensions/`:

- Stripe Connect Express onboarding + KYC state machine.
- Append-only `ledger_entries` (closed `effect_kind` enum, 16 kinds)
  + `payout_audit_events`. RLS + trigger + service all enforce
  append-only.
- Idempotency at every money write: inbound `Idempotency-Key` header
  + outbound to Stripe; inbox/outbox tables.
- Refund/chargeback cascade with five strategies (`pro_rata` default
  + four OWNER-only; non-default require compliance sign-off before
  `PR-W8-4`).
- Affiliate accrual / hold / clawback with FTC pin and $500
  negative-balance ceiling.
- Reward liability accounting (non-cash; money-transmitter avoidance).
- Anti-fraud closed rule set (5 rules) + OWNER queue (no ML in v1).
- Daily reconciliation job at 02:30 UTC against Stripe Balance
  Transactions; payout report endpoints with p95 < 200ms.
- Tax + multi-currency OWNER decisions: Stripe Tax ON for US
  destinations (`OWNER_DECISION STRIPE_TAX_DEFAULT`), USD-only in v1
  (`OWNER_DECISION MULTI_CURRENCY_V2`), 1099-K threshold tracker
  including state-level (`OWNER_DECISION STATE_1099_TRACKING`).
- Five new doctrine pins:
  `payouts-ledger-invariants.spec.ts`,
  `payouts-idempotency.spec.ts`,
  `payouts-money-shape.spec.ts`,
  `payouts-refund-cascade.spec.ts`,
  `payouts-fraud-rules.spec.ts`.

PR sequence: `PR-W8-1` (ledger + idempotency) → `PR-W8-2` (Connect)
→ `PR-W8-3` (default refund cascade) → `PR-W8-4` (OWNER strategies,
compliance gate) → `PR-W8-5` (affiliate) → `PR-W8-6` (rewards) →
`PR-W8-7` (fraud rules + queue) → `PR-W8-8` (reconciliation +
reports) → `PR-W8-9` (Stripe Tax + 1099-K).

### Wave 9 — storefront finance blocks, funnel analytics, community privacy (PR [#111](https://github.com/BradleyGleavePortfolio/tgp-finance-app/pull/111))

Three finance-aware storefront blocks (`OfferPriceBlock` with
price-band display, `TrustStripBlock` derived from bucketed signals,
`ApplicationGatedOfferBlock` with per-state visibility). Funnel
analytics: closed event enum, bucketed payloads, k-anonymity ≥ 50
on platform aggregate, default-OFF consent per `OWNER_DECISION
W9_FUNNEL_CONSENT_DEFAULT`, 13-month TTL. Community privacy:
money-shape scrubber on every post-write path, balance-quote
redaction on replies, OWNER kill-switch via space-freeze. Doctrine
pins: `community-privacy.spec.ts`, `funnel-analytics-consent.spec.ts`.

### Wave 10 — cross-product federation identity (PR [#111](https://github.com/BradleyGleavePortfolio/tgp-finance-app/pull/111))

v1 stays email-only per PR #93's existing posture. v2
`shared_identity_id` dual-write reference reserved per
`OWNER_DECISION W10_IDENTITY_MAPPING_V2` (recommendation: defer).
Three new federation endpoints: `/users/:email/org-rollup`,
`/orgs/:org_id/summary`, `/payouts/:user_email/summary`. Every
response carries `identityMapping: 'email'`; `503
FEDERATION_DISABLED` without the env var. Doctrine pin:
`federation-identity-shape.spec.ts`.

### Backend dependencies (cross-repo, in rough order)

The runtime PRs in this repo do not land before the cross-repo and
in-repo dependencies they need. The list below maps each finance
runtime PR to its hard dep.

1. Stripe checkout + webhook + idempotent ledger
   (`PR-W8-1` here / `growth-project-backend` checkout PR).
2. Application + decision tables (extends `backend/src/invites/`).
3. Affiliate attribution + single-tier commission model.
4. Marketplace ranking surface — editorial signals only, no
   outcome-derived ordering (Wave 7 here).
5. Threaded community / subject-extension storage on top of
   `backend/src/community/` with the moderation queue + URL
   allowlist (PR #106 §09 + Wave 9 here).
6. Events / calls / replays — calendar table, RSVP, replay index;
   third-party video provider, link allowlist.
7. Rewards engine (Wave 8 here) tied to the assignment contract
   from PR #106 §06.
8. Sub-coach hierarchy backend `org_memberships` (cross-repo Wave 2).
9. Admin control room backend (cross-repo Wave 3).
10. Mobile org mode (cross-repo Wave 4).

Each runtime PR in this repo is expected to land with its module
README updated in the same PR (per the README-per-PR rule above),
the matching doctrine pin (or an extension of an existing one), and
the matching `.env.example` entry where a new env var is introduced.

### OWNER decisions tabled across the wave specs

Each is recorded in its wave's spec with choices, recommendation,
and consequence. The OWNER ratifies before the relevant runtime PR
opens.

| Decision | Spec | Recommendation |
|---|---|---|
| `W6_PERMISSION_DEFAULT_NO` | Wave 6 | A — default-deny |
| `W7_BOOST_CAP` | Wave 7 | A — max 2.0× |
| `W9_FUNNEL_CONSENT_DEFAULT` | Wave 9 | A — default OFF |
| `W10_IDENTITY_MAPPING_V2` | Wave 10 | A — defer to v2 |
| `STRIPE_TAX_DEFAULT` | Wave 8 | A — ON for US destinations |
| `STATE_1099_TRACKING` | Wave 8 | A — track all state thresholds |
| `MULTI_CURRENCY_V2` | Wave 8 | A — defer; USD-only in v1 |

### Future plans (not yet specced)

- Public web coach profile (deferred from v1; behind a domain +
  SEO + reputation system).
- Group native video / live streaming (deferred; third-party in v1).
- Cross-coach client transfer.
- Billing / Stripe upgrade flow surfaced inside the app (today:
  out-of-band).
- v2 dual-write `shared_identity_id` between the fitness and
  finance backends (today: email-only mapping per Wave 10
  recommendation A).
- Multi-currency presentation + settlement (Wave 11).
- ML fraud assist (Wave 11).
- Cross-coach app installs (Wave 11).

### Operator guidance for this roadmap

- All wave specs land as draft, documentation-only PRs first.
  Runtime code lands in a follow-up PR per surface, behind a
  feature flag (global × per-coach), with the module README + a
  doctrine pin updated in the same PR.
- A consumer-finance compliance reviewer signs off on every spec
  that touches checkout, affiliates, marketplace ranking, AI
  copilot, community moderation, or non-default refund strategies
  (Wave 8 §4) before that spec's runtime PR opens.
- Trust Center capability flags reflect what the backend actually
  implements end-to-end. Flipping a flag without shipping the
  feature is treated as a sale-readiness regression and is pinned
  by `backend/test/system-trust-meta.spec.ts`.
- The full doctrine-pin set (extended across the waves) lives under
  `backend/test/`. Each new wave's spec adds at most one or two
  pins; the runtime PR adds the pin in the same commit as the
  runtime code. Failing a pin fails CI.
- Money is **`Decimal(14,2)`** end-to-end. Wire-side money is
  `{ amount: string, currency: string }`. PostHog events use
  bucketed bands; raw amounts never leave the server.
- `new-website/` is intentionally **not** part of this roadmap.
  No surface in any wave renders in a public marketing site; every
  storefront is in-app and coach-scoped.

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
