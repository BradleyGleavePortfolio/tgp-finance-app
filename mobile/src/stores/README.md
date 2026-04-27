# Mobile Stores (Zustand)

Per-domain Zustand stores. Each store caches a slice of derived /
backend-fetched state so screens stay snappy across navigation;
the source of truth always remains the backend.

## Files

```
authStore        Token + current user + login/logout/refresh helpers
profileStore     FinancialProfile + recompute call
accountsStore    Account list + CRUD passthrough
networthStore    /api/networth/current cache + history series
eodStore         Today's submission + history; submitEOD wrapper
priorityStore    Current priority + level-up flash
milestonesStore  Unlock list + celebration queue
whatifStore      Saved scenarios
chatStore        Conversation history (last N turns) for the AI coach
coachStore       (coach role) roster + alerts + selected client
```

## Conventions

- **One store per backend domain.** Don't share stores across
  domains; cross-domain coordination happens in the screens.
- **State is read-mostly.** Mutations call the backend first, then
  replace the slice with the response. No optimistic updates that
  diverge from the API shape.
- **Selectors over derived state.** Components reach into the store
  with a selector function (`useEodStore((s) => s.today)`) to keep
  re-renders narrow.
- **Hydration on mount.** Each store has a `refresh()` helper the
  owning screen calls in `useEffect`. Stores do not auto-refresh on
  app foreground today; that's a near-term TODO.

## Auth store integration

`authStore` listens to `authEvents` from `services/api.ts`. When the
refresh path emits `logout`, the store clears its slice and the
root layout (Expo Router) re-renders the `(auth)` route group. No
other store needs to know — they pull from the API on next mount.

## Security

- Stores never persist money to disk. Persistent state across
  cold starts is limited to the keychain-stored auth token, the
  user's id (for the splash screen's quick-resume), and the
  Supabase session inside the Supabase client.
- Coach store entries respect the backend's owner-bypass /
  coach-scoping. The mobile app cannot fabricate cross-tenant
  visibility — the API enforces it.

## Failure modes

- A failed refresh leaves the slice in its previous state and
  surfaces the error through a toast. Stores do not zero out on
  failure; the dashboard prefers stale-but-true to empty.
- A 401 mid-refresh is handled by the API interceptor's mutex; the
  store sees a single retry from its perspective.

## Tests

Store-specific specs are an open TODO. Today the integration is
exercised via the screen-level smoke tests under `mobile/test/`.

## Operations

- Adding a new store: copy an existing one (e.g. `priorityStore`)
  and adapt. Keep the `refresh()` shape consistent so
  `_layout.tsx` can call it from a single foreground hook later.
- Cross-store side effects: do them in the screen, not in the
  store, to keep stores composable.
