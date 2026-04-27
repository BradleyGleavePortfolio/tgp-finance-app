# Mobile (React Native + Expo)

The user-facing app. React Native via Expo SDK 51+, Expo Router for
file-based navigation, Zustand for state, and a single Axios instance
that talks to the NestJS backend at `apiUrl` (defaults to the Fly.io
deploy URL).

## Layout

```
app/                           Expo Router screens (file-based routes)
  (auth)/                      Login, register, role-select, verify-email
  (onboarding)/                Quiz screen
  (tabs)/                      Bottom-tab home, accounts, coach, goals, profile
  accounts/                    Single-account screens
  coach/student/[id].tsx       Coach view of one student
  eod/                         Submit + history
  whatif/                      Scenarios index, runner, compare
  settings/                    Notification + security
  _layout.tsx                  Root layout (auth gate, deep links, theme)
  index.tsx                    Splash / route resolver
src/
  components/                  Reusable UI (cards, charts, sheets)
  hooks/                       Cross-cutting hooks
  lib/                         Pure helpers (analytics, milestones, secureStorage,
                               signOut, identityTitle)
  services/                    External-IO clients
    api.ts                     Axios instance + endpoint groupings
    supabase.ts                Persistent Supabase client (session storage)
    notifications.ts           Expo notifications + local scheduling
    refreshQueue.ts            (in api.ts; documented below)
    sentry.ts                  Crash reporting wrapper
  stores/                      Zustand stores per domain
  theme/                       Color tokens, typography
  types/                       Shared TS types
  utils/                       Misc helpers (auth events, date math)
test/                          Jest specs (notifications)
```

Each `src/` subdir has its own `README.md` with the same shape:
purpose, key files, data flow, security, env vars, failure modes,
tests, operations.

## Environment variables

| Key | Required | Notes |
|-----|----------|-------|
| `EXPO_PUBLIC_SUPABASE_URL` | yes | Same Supabase project URL the backend uses. The app throws on startup if missing — there is no hardcoded fallback. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | yes | Anon key — safe to ship to clients but required explicitly. |
| `expoConfig.extra.apiUrl` | yes | Set in `app.json`. Defaults to `https://tgp-finance-api.fly.dev`. |

Put public env in `mobile/.env` or directly in the Expo config. Never
ship the service-role key here.

## API client

`src/services/api.ts` is the single Axios instance. Two interceptors:

- **Request** — attaches `Authorization: Bearer <token>` from
  `secureStorage`. Tokens live in the OS keychain on native via
  `expo-secure-store`; the adapter transparently migrates any legacy
  plaintext AsyncStorage copy on first read.
- **Response** — unwraps the backend's `{ data, success, timestamp }`
  envelope, and on a 401 coalesces concurrent requests through a
  *single* `refreshPromise` that swaps the Supabase refresh token for
  a new access token. If the refresh itself fails, an `authEvents`
  `logout` is fired exactly once and the caller sees the original
  error. This is the reason a long idle period followed by a
  dashboard load doesn't force a re-login.

Endpoint groupings (`authApi`, `accountsApi`, `eodApi`, `coachApi`,
…) live in `api.ts`. Add new groupings near the bottom — not as
their own files — to keep the call surface greppable.

## State stores (Zustand)

Per-domain stores in `src/stores/`:

```
authStore       The current user + tokens, plus login/logout helpers
profileStore    FinancialProfile + the recompute hook
accountsStore   Account list + mutations
networthStore   Cached current totals + history
eodStore        Today's submission + history
priorityStore   Current priority + level-up flash flag
milestonesStore Unlock list + celebration queue
whatifStore     Saved scenarios
chatStore       Conversation history for the AI coach
coachStore      (coach role) roster + alerts + active student
```

Stores own *only* derived/cached state. The source of truth is the
backend; refresh helpers in each store call the matching `Api`
endpoint and replace state in one shot.

## Security & tenancy

- Auth tokens live in `expo-secure-store` (keychain on iOS,
  encrypted SharedPreferences on Android, localStorage on web).
- Coach views into a student's data go through the coach-only
  endpoints (`/api/coach/*`); the mobile UI never assembles a
  cross-tenant view client-side.
- Deep links: `_layout.tsx` parses `?coach=<code>` from a signup
  share link and forwards it to the registration screen, which
  passes the code to `/api/auth/register`. There is no client-side
  validation of the code beyond a non-empty check; the backend
  rejects bad codes.

## Failure modes

- **Missing Supabase env** — `services/supabase.ts` throws on
  module init, which surfaces as a fatal load error. Intentional —
  shipping with the wrong env would silently log every user out.
- **Backend offline** — Axios `error.response` is undefined; the
  interceptor rewrites the message to "Cannot reach server." and
  rejects without firing the auth-failure path.
- **401 storm during refresh** — coalesced into one refresh call.
  If the refresh token is stale, exactly one logout event is
  emitted regardless of how many requests were in flight.

## Tests

`mobile/test/` — Jest specs running through the same `tsconfig.json`
the app uses. Today the meaningful coverage is `notifications.spec.ts`
(local notification scheduling). Component tests are an open TODO.

## Operations

- Expo OTA updates: shipping a JS-only change goes through `eas
  update`. Native changes (new permissions, native deps) require a
  full rebuild via `eas build`.
- Deep-link host: configured in `app.json` `scheme` + the universal
  link domains. Updates here require a rebuild *and* a refreshed
  Apple/Google AASA/asset-links file.
- If you bump the backend response envelope, this app's response
  interceptor must move at the same time.
