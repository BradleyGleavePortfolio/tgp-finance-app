# Mobile Services

External-IO clients: backend Axios instance, Supabase client,
Expo notifications wrapper, Sentry initializer.

## Files

- `api.ts` — Axios instance + endpoint groupings + token-refresh
  mutex. The single source of HTTP for the app.
- `supabase.ts` — persistent `createClient(...)` configured with
  `secureStorage` so sessions survive cold starts. Used directly by
  the auth screens; the rest of the app talks to the backend Axios
  instance.
- `notifications.ts` — Expo notification setup, permission prompts,
  local scheduling for streak / milestone reminders.
- `sentry.ts` — Sentry init wrapped so it's a no-op when `dsn` is
  missing.

## `api.ts` highlights

The token-refresh pattern is the most load-bearing piece in this
folder. Three primitives:

1. `refreshPromise: Promise<string> | null` — coalesces concurrent
   refreshes into one upstream call.
2. `loggedOutOnce: boolean` — fires a single `authEvents.emit
   ('logout')` per refresh-failure cascade, with a 1-second reset
   so a later successful login → 401 cycle still works.
3. `_retry` flag on the Axios config — guards against an infinite
   retry loop if the refreshed request also returns 401.

Without these, every Supabase access-token expiration (~1h) would
either crash a single request or bounce the user back to login.
With them, the user stays signed in for as long as their refresh
token is valid.

The response interceptor also unwraps the backend envelope:
`{ data, success, timestamp }` → `data`. Everything past the
interceptor sees the raw payload.

## Endpoint groupings

`authApi`, `accountsApi`, `networthApi`, `priorityApi`, `chatApi`,
`eodApi`, `onboardingApi`, `milestonesApi`, `whatifApi`, `coachApi`,
`notificationsApi`, `aiApi`, `usersApi`, `trustApi`, `profileApi`,
`paydayApi`, `preferencesApi`, `communityApi`. Each is a frozen
object of named methods; add new methods to the existing object
rather than introducing a new file.

## Notifications

`notifications.ts` owns the permission prompt, the Expo token
registration call (`PUT /api/notifications/preferences` with
`expo_push_token`), and any local notification scheduling (used for
"your spending DNA is ready" prompts based on the
`/api/ai/spending-dna/latest` poll). All actual transactional pushes
come from the server (`backend/src/push/`); local notifications are
purely a presentation aid.

## Security

- Tokens live in `expo-secure-store` via the `secureStorage`
  adapter. The Axios request interceptor reads the token from
  storage on every request — there is no in-memory cache that can
  go stale across signouts.
- The Supabase service-role key is **never** here. Only the public
  `EXPO_PUBLIC_SUPABASE_*` values are used.

## Environment variables

| Key | Effect |
|-----|--------|
| `EXPO_PUBLIC_SUPABASE_URL` | Required. Both `supabase.ts` and `api.ts` (refresh path) read this. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Required. Used by both files. |
| `expoConfig.extra.apiUrl` | Backend host. Defaults to the Fly.io URL. |
| `expoConfig.extra.sentryDsn` | Optional. Without it, `sentry.ts` is a no-op. |

## Failure modes

- **No Supabase env** → app fails fast on module load. Intentional.
- **Refresh failure** → one `authEvents.emit('logout')` and a
  cleared keychain. The auth screen gets re-mounted by
  `_layout.tsx`'s auth gate.
- **Network outage** → the interceptor rewrites the error message
  to "Cannot reach server." and rejects. UI stores reflect "no
  data" rather than rendering stale state as authoritative.

## Tests

- `notifications.spec.ts` — local notification scheduling matches
  the user's `eod_reminder_time`.
- The auth interceptor logic (`api.ts`) is a near-term TODO. The
  refresh mutex pattern is identical to the fitness app, where the
  same shape is covered by `services/api.spec.ts`.

## Operations

- Backend URL changes: bump `expoConfig.extra.apiUrl`, then push
  a new EAS update. The app reads the value at startup.
- Token migration: when we move tokens between storage backends
  in a future release, leave the legacy read path alive for one
  release so users with the old binary don't get force-logged-out.
