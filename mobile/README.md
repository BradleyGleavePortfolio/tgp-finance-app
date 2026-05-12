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
| `EXPO_PUBLIC_SENTRY_DSN` | optional | Server-side DSN. When unset, `initSentry()` is a no-op and the app ships without telemetry. |
| `EXPO_PUBLIC_ENVIRONMENT` | optional | `development` / `preview` / `production`. Tags every Sentry event so dashboards can filter. |
| `SENTRY_AUTH_TOKEN` | EAS Secret only | Needed by the EAS build to upload source-maps to Sentry. Never commit. Create it once with `eas secret:create --scope project --name SENTRY_AUTH_TOKEN --value $TOKEN`. Generate the token at sentry.io → User Settings → Auth Tokens with `project:releases` and `project:write` scopes. When unset, the build skips the upload step rather than failing — production stack traces will be minified until the secret is added. |
| `SENTRY_ORG` | optional EAS Secret | Override for the org slug declared in `app.json` `plugins.@sentry/react-native/expo.organization`. Set only if the EAS build needs to target a different org than the one pinned in source. |
| `SENTRY_PROJECT` | optional EAS Secret | Same shape as `SENTRY_ORG` but for the project slug. |

Put public env in `mobile/.env` or directly in the Expo config. Never
ship the service-role key here.

## Sentry source-maps

Production stack traces stay readable because `metro.config.js` wraps
Expo's default Metro config with `getSentryExpoConfig` from
`@sentry/react-native/metro`, and `app.json` registers the
`@sentry/react-native/expo` config plugin with the org and project
slugs. EAS picks up `SENTRY_AUTH_TOKEN` from project secrets and
runs the bundled `sentry-expo-upload-sourcemaps` step on every build.
The release identifier the running app sends is
`${expo.version}+${expo.ios.buildNumber || expo.android.versionCode}`
(see `src/services/sentry.ts`), which is the same identifier the
upload tags so dashboards can match traces to symbolicated frames.

When `SENTRY_AUTH_TOKEN` is unset, the upload silently skips. The
build still succeeds; Sentry just keeps showing minified frames
until the secret is added.

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
(local notification scheduling). Component-level coverage is not yet
in place; see the issue tracker.

## Versioning

Version metadata is owned by `mobile/app.json` and bumped manually in
git before each EAS production build. `eas.json` `cli.appVersionSource`
is set to `"local"` so EAS reads the values from source rather than
auto-incrementing remotely — every change is visible in the commit
history.

| Field | Where | When to bump |
|-------|-------|--------------|
| `expo.version` | `app.json` | Every public release. Semantic-version style (`1.0.0` → `1.0.1` for fixes, `1.1.0` for features, `2.0.0` for store-listing-visible reshapes). |
| `expo.ios.buildNumber` | `app.json` | Every TestFlight or App Store upload, including reuploads of the same `version`. Apple rejects duplicate `(version, buildNumber)` pairs. Monotonically increasing string (`"1"`, `"2"`, …). |
| `expo.android.versionCode` | `app.json` | Every Play Console upload, including reuploads. Google rejects duplicate `versionCode`. Monotonically increasing integer (`1`, `2`, …). |

`expo.ios.infoPlist.ITSAppUsesNonExemptEncryption` is set to `false`
so TestFlight skips the export-compliance prompt on every upload. The
app does not implement custom cryptography beyond the standard iOS
TLS stack, which is exempt.

Sentry's release identifier (see `src/services/sentry.ts`) is built
from `expo.version` plus the platform-specific build number, so
forgetting to bump the build number on an upload also collapses the
Sentry release tag onto the previous one. Always bump both.

This pattern matches the fitness mobile repo, which has the same
`appVersionSource: "local"` policy. Keeping the two repos aligned
means a single release runbook covers both apps.

## Operations

- Expo OTA updates: shipping a JS-only change goes through `eas
  update`. Native changes (new permissions, native deps) require a
  full rebuild via `eas build`.
- Deep-link host: configured in `app.json` `scheme` + the universal
  link domains. Updates here require a rebuild *and* a refreshed
  Apple/Google AASA/asset-links file.
- If you bump the backend response envelope, this app's response
  interceptor must move at the same time.

## Operator Fill-Ins Required

The canonical EAS-secret table for the finance mobile app lives in the [root README](../README.md#mobile--testflight-blocking-eas-secrets) under "Operator Fill-Ins Required → Mobile". Set every `EXPO_PUBLIC_*` value listed there before running an EAS production build from this directory.

## TestFlight Launch Checklist

The finance mobile app ships from this directory to TestFlight (iOS) and Play Internal Testing (Android). Confirm each step before tagging a build.

### 1. Pre-flight

- [ ] All EAS production-profile secrets in the root README's [Mobile fill-ins table](../README.md#mobile--testflight-blocking-eas-secrets) are set. Verify with `npx eas-cli env:list --environment production`.
- [ ] **Backend `tgp-finance-api` is deployed at the version this build expects.** The mobile app does not function with a stale or down backend — the data fetch on first launch will fail closed.
  - Active blocker: backend deploy is failing pending the `fix/prisma-direct-url` PR + `DIRECT_URL` Fly secret. Do not build mobile until backend is green.
- [ ] `app.json` build numbers were bumped in this handoff PR: `ios.buildNumber` 8 → 9, `android.versionCode` 7 → 8. Confirm these are the next monotonic values relative to whatever is already in App Store Connect / Play Console.
- [ ] `expo.extra.eas.projectId` in `app.json` matches the EAS project the operator's `eas-cli` is logged into.
- [ ] `EXPO_PUBLIC_COACH_SIGNUP_SECRET` matches the backend's `COACH_SIGNUP_SECRET` byte-for-byte. A mismatch causes silent coach signup HMAC failures.

### 2. Build

```bash
# iOS only — TestFlight target
npx eas-cli build --platform ios --profile production

# Android only — Play Internal target
npx eas-cli build --platform android --profile production

# Both at once
npx eas-cli build --platform all --profile production
```

The `production` profile is defined in [`eas.json`](eas.json) and sets `distribution: "store"` + `environment: "production"`. The Android variant produces an `.aab` (`buildType: "app-bundle"`).

### 3. Submit

```bash
# iOS
npx eas-cli submit --platform ios --latest

# Android (uses ./pc-api-key.json — confirm it exists locally before submit)
npx eas-cli submit --platform android --latest
```

### 4. TestFlight verification

Once the build is processed in App Store Connect, assign to the internal testing group and verify on a physical device:

- [ ] Sign-in with email/password completes against the live backend.
- [ ] Coach signup with a fresh invite code completes (HMAC token verifies against backend `COACH_SIGNUP_SECRET`).
- [ ] Coach dashboard loads at least one client without error.
- [ ] Daily check-in submit round-trips and persists across cold restart.
- [ ] Federation: a client's coach insights page resolves data from the fitness backend through the federation token (`FEDERATION_SERVICE_TOKEN` ↔ fitness `FINANCE_SERVICE_TOKEN`).
- [ ] No Sentry crashes in the first 5 minutes of use (verify in the finance mobile Sentry project).
