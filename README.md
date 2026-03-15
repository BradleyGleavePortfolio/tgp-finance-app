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

## API Keys

Fill these in your `.env` file:

| Key | Where to get it |
|-----|----------------|
| `DATABASE_URL` | Supabase dashboard → Settings → Database → Connection String (URI format) |
| `SUPABASE_URL` | Supabase dashboard → Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Supabase dashboard → Settings → API → `anon` public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Settings → API → `service_role` secret key |
| `PERPLEXITY_API_KEY` | perplexity.ai → Settings → API → Generate Key |
| `JWT_SECRET` | Generate with: `openssl rand -hex 32` (or any 32+ char random string) |
| `GOOGLE_CLIENT_ID_*` | console.cloud.google.com → Credentials → OAuth 2.0 (optional for dev) |
| `NUMBEO_API_KEY` | numbeo.com/api (optional; fallback data is bundled) |

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
- Coach backdoor code: `6678345`

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
- Gmail Integration: Google OAuth pre-wired. Extend to Gmail API by adding scope in `mobile/src/services/supabase.ts`

## Disclaimer
This app provides financial education and tracking tools for informational purposes only. Nothing in this app constitutes financial, tax, or investment advice. Consult a licensed financial professional before making financial decisions.
