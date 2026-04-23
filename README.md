# The Growth Project: Finance

A production-grade, multi-tenant financial coaching and accountability app built for ambitious men in their 20s and 30s who are serious about building real wealth.

**Three Pillars:** CONTROL (know where every dollar is) | MOMENTUM (daily progress visible) | FREEDOM (financial independence)

Part of The Growth Project coaching ecosystem (thegrowthproject.courses).

## Tech Stack
- Frontend: React Native + Expo SDK 51+ (TypeScript, Expo Router, Zustand)
- Backend: Node.js + NestJS (TypeScript)
- Database: PostgreSQL + Prisma ORM (v5.22)
- Auth: Supabase Auth (email/password + Google OAuth)
- AI Coach: Perplexity sonar-pro (backend-proxied, 20 req/user/hr)
- Charts: react-native-gifted-charts
- Validation: Zod (shared frontend + backend)

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

## All Features
- Net Worth Engine (real-time after every EOD submission)
- Financial Vital Signs (4 live metrics: Net Worth, Cash Flow, DTI, Savings Rate)
- Wealth Velocity Score (0-100, 7 named levels)
- Interest Bleed Counter (real-time second-by-second ticker)
- EOD Daily Check-In with streak tracking + AI insights
- Priority Waterfall Engine (7 levels, auto-advances)
- 12 What-If Scenarios (debt payment, income increase, relocate to 30+ countries, cut expense, lump sum invest, sell asset, start business, early debt payoff, salary negotiation, tax optimization, retire early)
- Net Worth Projection Engine (interactive sliders)
- Debt Avalanche vs Snowball visual race
- AI Coach (FP) powered by Perplexity sonar-pro (15 few-shot examples)
- 15 Milestone Celebrations (cash, debt, net worth, streak, income)
- Payday Deploy flow
- Income Gap Analyzer
- Tax Burden Estimator (2026 federal + all 50 state brackets)
- Future Self Letter (written at onboarding, delivered at day 90)
- Spending DNA monthly AI report
- Coach Dashboard (red flags, student timeline, program templates)
- Accountability Pairing (privacy-safe: streaks/scores only)
- Spending Habits Tracker (5 daily mini-habits)
- Deep Onboarding Quiz (16 questions across 5 phases)

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

Dependabot (`.github/dependabot.yml`) opens weekly grouped minor/patch update PRs for `backend/`, `mobile/`, and the workflows themselves.

## Production Deploy (Fly.io)

The backend deploys via `fly.toml` in `backend/`. Database migrations are wired
into the release process and run automatically on every deploy, before new VMs
start:

```toml
[deploy]
  release_command = 'npx prisma migrate deploy'
```

Fly runs this in a temporary VM with the app's secrets (`DATABASE_URL`, etc.)
injected. If the migration fails, the release is aborted and no traffic is
shifted. The `prisma` CLI is bundled into the production image for this purpose
(see `backend/Dockerfile`).

To author a new migration locally:

```bash
cd backend
npx prisma migrate dev --name <descriptive_name>
git add prisma/migrations
```

Do **not** commit the auto-generated `prisma/migrations` shadow DB.

## Disclaimer
This app provides financial education and tracking tools for informational purposes only. Nothing in this app constitutes financial, tax, or investment advice. Consult a licensed financial professional before making financial decisions.
