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

### Prepared (open, draft, unmerged)

- **Coach-led finance programs — spec set.** Draft PR
  [#106](https://github.com/BradleyGleavePortfolio/tgp-finance-app/pull/106).
  Documentation-only. Twelve specs (~4,576 lines) under
  `docs/specs/coach-led-programs/` covering finance challenges,
  multi-phase regimens, opt-in balance-redacted leaderboards, profile
  avatars, coach content boards, the L1 / L2 / L3 client tier model
  and the `coach` / `coach_premium` coach tiers, the assignment
  contract shared across challenges / content / regimens, structured
  messaging progress payloads, the consumer-finance compliance
  boundary (`09-compliance.md`, gates merge), and the rollout /
  operator playbook. No runtime code, schema, or migration changes.
  No `new-website/` changes (none exists in this repo).

  Architectural decisions taken in that PR:

  1. Programs / challenges / content share an **assignment
     contract**, not an assignments table. Each has its own row
     shape.
  2. Money never appears in a leaderboard. Pinned by Zod `.strict()`
     + a doctrine spec.
  3. Content storage is Supabase Storage with signed URLs, not
     Postgres bytea.
  4. No public web profiles for coaches or clients in v1.
  5. Feature flags are global × per-coach. A surface is on for a
     request iff both are true.
  6. Doctrine-pin tests extend, do not branch on flags. The
     `mobile/DESIGN.md` register applies whether the flag is on or
     off.

### Current wave — finance one-stop-shop UX (specs in flight)

A second documentation wave is being prepared (target spec set,
draft / unmerged; PR numbers to be assigned in the **#117–#123**
range as the backend dependencies land). The intent is to make this
app the single place a coach runs a finance program end-to-end
without sending a client to a separate checkout, course host, chat
tool, or events tool.

Whop is the reference shape — a creator one-stop-shop where the
storefront, checkout, members area, content, community, events,
affiliates, and rewards live behind one login. The TGP register
(bone / ink / oxblood, no emoji, no gamification chrome, no
outcome guarantees, redacted balances) replaces the consumer-
finance-incompatible parts. Strategic context:
[whop.com](https://whop.com), [whop.com/sell](https://whop.com/sell).

The current wave (specs only, no schema, no controllers, no
migrations) covers:

- **Coach storefronts.** A coach-scoped public-facing storefront
  with editorial copy, no testimonials carousel, no countdown
  timers, no urgency chrome. L2 / L3 tier presentation, plain
  pricing, the disclaimer rendered before the CTA. No public web
  profile of the coach in v1 — the storefront is the coach's
  surface.
- **Checkout, deposits, and subscriptions.** Stripe-backed checkout
  for one-time programs, recurring subscriptions, and refundable
  commitment deposits. Read-only over balances; the app does not
  move client money. SCA / 3-D Secure is required end-to-end.
  Receipts are editorial, not promotional.
- **Applications.** A coach can require an application before a
  client can purchase or attach. The application lives next to the
  invite-code flow already shipped in PR #81. Decisions are
  appealable; reasons for rejection are templated to avoid
  fair-lending risk.
- **Affiliates and referrals.** Coach- and client-side referral
  links, a transparent commission model, no MLM chains
  (single-tier only), no off-platform payout. Compliance pin: no
  outcome-based affiliate copy.
- **Marketplace.** Cross-coach discovery surface inside the app for
  L2 / L3 clients. Coaches opt in; ranking is editorial, not
  outcome-driven. No reviews-with-stars in v1 — review quotes only,
  curated, never auto-aggregated, to keep the consumer-finance
  outcome-claim line clear.
- **Finance communities.** Threaded subject extension on top of the
  existing messaging surface. Money never appears in community
  posts; quote-of-balance is stripped server-side. Moderation queue
  + URL allowlist as in `09-compliance.md`.
- **Events, calls, and replays.** Coach-scheduled live calls
  (third-party video, link allowlist) with a calendar surface,
  RSVP, recordings as `coach_premium`-tier content, and a replay
  index. No native group video in v1.
- **Rewards and bounties.** Coach-defined non-monetary rewards
  (status, content unlocks, free month) tied to challenge / regimen
  completion. No cash bounties — keeps the platform out of money
  transmission.
- **Finance-safe AI copilot.** Extends the Perplexity-backed coach
  proxy already shipped. Voice rules and the
  `backend/test/ai-prompt-doctrine.spec.ts` pin apply to every new
  surface (chat, EOD insight, Spending DNA, and any new copilots
  introduced in this wave). No outcome promises, no specific
  ticker / fund recommendations, no tax advice.

Every spec in this wave is expected to follow the
`docs/specs/coach-led-programs/` shape: why / when / where / who /
what / how, plus the 16-section structural checklist (data + API
sketches, UX / nav, privacy / security, abuse / moderation, feature
flags, analytics, rollout, tests, risks, dependencies, acceptance
criteria, operator handoff). Money never appears in a leaderboard
or a community post; balances stay redacted on every shared surface.

### Backend dependencies

The wave above does not land before the backend lifts the
foundations it needs. The PRs in the **#117–#123** range
(numbers assigned as they open; not yet on GitHub) are reserved
for, in rough order:

1. Stripe webhook + checkout session module + idempotent ledger of
   purchases / subscriptions / deposits.
2. Application + decision tables, with the coach-invite flow in
   `backend/src/invites/` as the integration point.
3. Affiliate + referral attribution, single-tier commission model,
   payout export (no in-app payout).
4. Marketplace ranking surface — editorial signals only, no
   outcome-derived ordering.
5. Threaded community / subject-extension storage on top of
   `backend/src/community/` with the moderation queue + URL
   allowlist from `09-compliance.md`.
6. Events / calls / replays — calendar table, RSVP, replay index;
   third-party video provider, link allowlist.
7. Rewards engine — non-monetary reward grants tied to the
   assignment contract from `06-assignments.md`.

Each PR in this range is expected to land with its module README
updated in the same PR (per the README-per-PR rule above), the
matching doctrine pin (or an extension of an existing one), and the
matching `.env.example` entry where a new env var is introduced.

### Future plans (not yet specced)

- Public web coach profile (deferred from v1; behind a domain +
  SEO + reputation system).
- Group native video / live streaming (deferred; third-party in v1).
- Cross-coach client transfer.
- Billing / Stripe upgrade flow surfaced inside the app
  (today: out-of-band).
- Shared `shared_identity_id` between the fitness and finance
  backends (today: email-only mapping; see "Where this app sits in
  the TGP product").

### Operator guidance for this roadmap

- All wave specs land as draft, documentation-only PRs first.
  Runtime code lands in a follow-up PR per surface, behind a
  feature flag (global × per-coach), with the module README + a
  doctrine pin updated in the same PR.
- A consumer-finance compliance reviewer signs off on every spec
  that touches checkout, affiliates, marketplace ranking, AI
  copilot, or community moderation before that spec's runtime PR
  opens.
- Trust Center capability flags reflect what the backend actually
  implements end-to-end. Flipping a flag without shipping the
  feature is treated as a sale-readiness regression and is pinned
  by `backend/test/system-trust-meta.spec.ts`.
- `new-website/` is intentionally **not** part of this roadmap.
  No surface in the wave above renders in a public marketing site;
  every storefront is in-app and coach-scoped.

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
