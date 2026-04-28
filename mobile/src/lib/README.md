# Mobile Lib

Pure helpers — no React, no IO that depends on the screen tree. If a
helper grows side effects beyond storage IO, move it to
`src/services/`.

## Files

- `secureStorage.ts` — `StorageAdapter` over `expo-secure-store`
  on native and AsyncStorage on web. Transparently migrates legacy
  AsyncStorage-stored tokens into the keychain on first read, then
  deletes the plaintext copy. Keys must match
  `/^[\w.-]+$/` (Supabase's `sb-<project-ref>-auth-token` complies).
- `signOut.ts` — coordinated sign-out: clears tokens via
  `secureStorage`, calls Supabase `signOut`, fires the analytics
  event, and emits the auth event so stores reset.
- `analytics.ts` — thin client-side wrapper that defers to PostHog
  when available; no-op otherwise.
- `milestones.ts` — definition list mirroring the backend's
  `MILESTONES` so the UI can render copy without an API round trip.
  Keep in sync with `backend/src/milestones/milestones.service.ts`.
- `identityTitle.ts` — derives the "you are X" title from priority
  index + streak. Pure function; unit-tested in isolation.
- `authErrors.ts` — maps raw Supabase, OAuth, network, and 5xx
  noise to a single short user-safe sentence. Login, register,
  Google sign-in, password reset, and role-select all route through
  it so the user never sees a raw upstream message. Covered by
  `authErrors.spec.ts`.

## Security

- Tokens never live in plaintext on native. Web is best-effort
  (browser localStorage); the security model assumes the backend's
  rate limit + JWT expiry are the real defense on web.
- Sign-out clears every storage slot we wrote to, including the
  legacy AsyncStorage location, to prevent resurrected sessions
  after migration.

## Tests

- `authErrors.spec.ts` — maps the known Supabase / OAuth / network /
  5xx cases to the short user-safe sentence. Add a case here before
  surfacing a new auth-error path in the UI.

`secureStorage.ts` and `identityTitle.ts` are good candidates for
direct specs (both are pure or storage-only). Currently exercised
indirectly through the mobile auth and priority screens.

## Operations

- Adding a new milestone in `backend/src/milestones/`: also add it
  to `lib/milestones.ts`. The mobile UI uses this list to render
  the "X to go" copy on the priority bar without a server call.
