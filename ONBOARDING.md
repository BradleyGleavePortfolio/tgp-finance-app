# Finance Onboarding

You are joining `tgp-finance-app`, the finance pillar of The Growth Project. This is a monorepo: NestJS backend in `backend/`, React Native plus Expo mobile in `mobile/`. This document is the first thing to read after `git clone`. Budget about two hours.

Last verified: 2026-05-09.

---

## What this repo does

The finance app pairs a daily check-in with a long-running record of net worth, cash flow, debt, and a coach-curated set of priorities. It is **read-only** — it observes balances, it does not move money. The product is built around three ideas: a complete view of where the money is, a daily artefact of progress against it, and a clear account of how long the work to financial independence will take.

Two halves of one product:

- **Backend** (`backend/`) — NestJS 10 + Prisma 5 + Supabase Postgres. Hosts the mobile API, the cross-pillar federation surface, the AI coach gateway, and the read-only admin layer that the unified admin console (in the fitness backend) reads. Deploys to Fly.io as `tgp-finance-api`.
- **Mobile** (`mobile/`) — React Native + Expo SDK 51+ with Expo Router and Zustand. Cormorant Garamond display, Inter body, bone / ink / oxblood palette per `mobile/DESIGN.md`.

The repo's dual nature is intentional: shipping backend and mobile changes in lockstep avoids the drift that bit Stage 2.

---

## Local setup

```bash
git clone git@github.com:BradleyGleavePortfolio/tgp-finance-app.git
cd tgp-finance-app
cp .env.example .env
# fill in DATABASE_URL, SUPABASE_*, JWT_SECRET, COACH_ACCESS_CODE,
# PERPLEXITY_API_KEY, and the EXPO_PUBLIC_* vars in mobile/.env
npm run install:all
npm run migrate
npm run seed
npm run dev   # backend on :3000 plus Expo
```

You need:

- Node.js 20+
- A Supabase project for local dev (cheapest tier is fine)
- Expo CLI (bundled with Expo SDK)
- Xcode (iOS simulator) or Android Studio (Android emulator) for mobile

The `.env` MUST live at the repo root, not under `backend/` or `mobile/`. The backend reads from the project root.

---

## Codebase tour — backend

```
backend/src/
├── accountability/   # Streaks plus partner pairing
├── accounts/         # Net worth account ledger
├── admin/            # OWNER-gated admin layer plus federation surface (/api/admin/federation/*)
├── ai/               # Perplexity sonar-pro gateway plus DB-backed sliding-window rate limit
├── analytics/        # PostHog wrapper (no-op without key)
├── auth/             # Sign-in, sign-up, role selection, coach access code (Sprint A is rewriting the coach signup gate)
├── coach/            # Coach dashboard, red flags, student timeline, program templates
├── common/           # Validators (Zod schemas), guards, pipes, decorators
├── community/        # Coach-to-team posts (Stage 2)
├── costliving/       # Numbeo + bundled cost-of-living JSON for relocation what-ifs
├── eod/              # End-of-day check-in plus per-submission AI insight
├── health/           # Liveness probes
├── invites/          # Coach invites and redemption
├── milestones/       # Fifteen unlock criteria
├── networth/         # Net worth recompute on every EOD submit
├── notifications/    # Expo push, in-app inbox
├── onboarding/       # Sixteen-question quiz plus future-self letter
├── payday/           # Payday deploy flow
├── preferences/      # User preferences
├── priorities/       # Priority Waterfall (seven levels, auto-advancing)
├── prisma/           # Prisma client wrapper
├── profile/          # Trust Center, profile, account access status
├── projections/      # Net worth projection sliders
├── push/             # Expo push sender
├── system/           # Trust Center capability flags, release-info endpoint, support contact resolution
├── users/            # User CRUD, access status, membership card
└── whatif/           # Twelve scenario runners (debt, income, relocate, expense cuts, etc.)

backend/test/
├── ai-prompt-doctrine.spec.ts        # Pins AI system-prompt voice rules
├── system-trust-meta.spec.ts         # Pins Trust Center capability flags
├── admin-federation.*.spec.ts        # Federation surface auth + shaping + URL decoding
├── admin-finance-bridge.spec.ts      # Bridge endpoints for the unified admin console
├── users-controller.spec.ts          # Concierge-handoff payload
└── users-access-status.spec.ts       # Membership-card surface
```

`backend/src/admin/README.md` has the federation surface module-level doc. `backend/docs/DEPLOY.md` has the full Fly deploy procedure.

## Codebase tour — mobile

```
mobile/
├── app/             # Expo Router routes (file-system based)
├── src/
│   ├── components/  # Shared UI components
│   ├── lib/         # Helpers (api client, deep links, date math)
│   ├── services/    # Backend API client
│   ├── store/       # Zustand stores
│   └── theme/       # Design tokens (bone, ink, oxblood) per DESIGN.md
├── assets/          # Fonts (Cormorant Garamond, Inter), images, icons
├── docs/            # Mobile-specific docs
├── test/            # Jest plus React Native Testing Library
├── DESIGN.md        # Editorial register and brand doctrine
├── app.json         # Expo config
└── eas.json         # EAS Build profiles
```

---

## Conventions

- **Strict TypeScript.** No `any`, no `@ts-ignore`. CI (`tsc --noEmit`) rejects either.
- **Validation.** Zod schemas are shared between backend and mobile via `backend/src/common/validators/schemas.ts` (or a sibling). The boundary contract is the schema; do not pass through raw bodies.
- **AI prompts pinned.** `backend/test/ai-prompt-doctrine.spec.ts` enforces the voice rules from `mobile/DESIGN.md` §5: no emoji, no audience framing, no "FP" persona, no 15-example sales-funnel block, voice-rule keywords present. Editing a prompt without updating the test is a regression.
- **Trust Center capability flags pinned.** `backend/test/system-trust-meta.spec.ts` enforces that the flags reflect what the backend actually implements end-to-end. Flipping a flag without shipping the feature is a sale-readiness regression.
- **Federation is bearer-gated.** `/api/admin/federation/*` requires `Authorization: Bearer <FEDERATION_SERVICE_TOKEN>`. Without the bearer: `401 FEDERATION_UNAUTHENTICATED`. Without the env var: `503 FEDERATION_DISABLED`.
- **Identity mapping is email-based today.** Every federation response surfaces `identityMapping: 'email'` so a one-sided match is loud. `shared_identity_id` is the long-term plan.
- **Read-only.** The app observes balances, does not move money. Anything that smells like a bank rail is out of scope.
- **Quiet design register.** Bone, ink, and oxblood. Cormorant Garamond display. No emoji. No gamification. No placeholder copy in shipped UI. New code that adds a colour, a fake value, a `TODO` marker, or a confetti animation is expected to fail review on doctrine grounds.
- **README with every PR.** Module-level READMEs share the same shape: purpose, key files, endpoints, data flow, security / tenancy, env vars, failure modes, tests, operations.
- **Reversible migrations.** Forward-only in production but author the down step in source for emergencies.

---

## Auth model — the short version

- Supabase Auth issues ES256 JWTs. Email plus password and Google OAuth are wired.
- The backend verifies tokens locally against the Supabase JWKS — no round-trip on every request.
- `JwtAuthGuard` is registered globally. Public endpoints opt in with `@Public()`.
- Role guards (`@UseGuards(RoleGuard)` plus `@Roles(...)`) sit on top of the auth guard for coach- and owner-only routes.
- Coach role is granted by an OWNER (`POST /api/admin/promote`) or by the in-app role-selection flow with a valid `COACH_ACCESS_CODE` — currently gated by the dev-backdoor flag in production. **Sprint A is replacing this gate with a deep-link token flow.**

---

## Federation — the short version

- This finance backend exposes `/api/admin/federation/*` gated by `FEDERATION_SERVICE_TOKEN`.
- The fitness backend (`backend-spring-lake-3890`) is the consumer; it presents the bearer to read finance-side coach plus client summaries for the unified admin console.
- The same secret must be set on both Fly apps in lockstep. Rotation is coordinated — see `RUNBOOK.md`.
- Identity mapping is email-based, case-insensitive. Every response surfaces `identityMapping: 'email'`.

---

## Where to start when a ticket says…

| Ticket says | Start in |
|---|---|
| "Coach can't add a client (no invite-code screen)" | `mobile/app/coach/` plus `backend/src/invites/`. Sprint A Fix 1 ports the fitness `InviteCodesScreen`. |
| "I'm a Coach returns 403 in production" | `backend/src/auth/auth.service.ts`. The dev-backdoor gate is hard-blocking production. Sprint A Fix 2 replaces with a token flow. |
| "PracticeSelection asymmetric across pillars" | `mobile/app/coach/...PracticeSelectionScreen` plus `backend/src/coach/`. Sprint A Fix 3 puts it on the first-run gate and dual-writes both backends. |
| "Federation surface returning 503" | `FEDERATION_SERVICE_TOKEN` not set or mismatched. See `RUNBOOK.md` "Rotating FEDERATION_SERVICE_TOKEN". |
| "AI coach is unresponsive" | `backend/src/ai/`. Check the DB-backed sliding-window rate limit (20 req / user / hr). |
| "Net worth not updating" | `backend/src/networth/` plus `backend/src/eod/` — recompute is wired into EOD submission. |
| "Trust Center flag wrong" | Update the implementation, then the flag, then the pinned test. All in the same PR. |

---

## Day-one checklist

- [ ] Clone the repo and run `npm run install:all`.
- [ ] Provision a personal Supabase project for local dev.
- [ ] Generate a `JWT_SECRET` (`openssl rand -hex 32`).
- [ ] Fill `.env`; run `npm run migrate`; run `npm run seed`; run `npm run dev`.
- [ ] Hit `http://localhost:3000/api/health` — should return ok.
- [ ] Sign in to the mobile app on a simulator with the seeded student account (`student@tgp-finance.demo` / `Demo1234!`).
- [ ] Switch to the seeded coach account (`coach@tgp-finance.demo` / `Demo1234!`) and confirm the coach dashboard renders.
- [ ] Run `cd backend && npm test && cd ../mobile && npm test`. All 244 backend plus 77 mobile tests should pass.
- [ ] Read `README.md`, `RUNBOOK.md`, `EAS-BUILD.md`, `mobile/DESIGN.md`, `backend/src/admin/README.md`.

If anything in the day-one checklist fails, that is the first ticket.

---

## Companion docs

- `README.md` — operator-facing reference (env vars, what is in the app, operator actions, Stripe TBD, federation contract)
- `RUNBOOK.md` — daily-ops handbook for `tgp-finance-api`
- `EAS-BUILD.md` — mobile production build commands and common errors
- `backend/docs/DEPLOY.md` — full Fly deploy procedure plus baseline-recovery
- `backend/src/admin/README.md` — federation surface module-level doc
- `mobile/DESIGN.md` — editorial register and brand doctrine
