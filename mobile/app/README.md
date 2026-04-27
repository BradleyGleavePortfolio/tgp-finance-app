# Mobile Routes (Expo Router)

File-based routing. Each `.tsx` file under `app/` is a route; folders
group routes; parentheses-named folders (`(auth)`, `(tabs)`) are
"groups" that don't appear in the URL.

## Layout

```
_layout.tsx              Root layout. Auth gate, deep-link parser, theme provider.
index.tsx                Splash route. Checks auth, redirects.

(auth)/                  Pre-authenticated screens
  _layout.tsx
  login.tsx              Email/password + Google
  register.tsx           Reads ?coach=<code> from deep link
  role-select.tsx        Post-signup role chooser (student / coach)
  verify-email.tsx       Sit-and-poll on Supabase email confirmation

(onboarding)/            Post-signup, pre-app
  _layout.tsx
  quiz.tsx               The onboarding quiz; submits to /api/onboarding/quiz

(tabs)/                  Authenticated bottom-tab home
  _layout.tsx
  index.tsx              Dashboard (hero card, milestone, trust cues)
  accounts.tsx           Account list
  coach.tsx              Coach surface (different copy for coach vs client)
  goals.tsx              Priority waterfall + milestones
  profile.tsx            Profile editor + settings entry

accounts/[id].tsx        Single-account detail
accounts/add.tsx         Add-account flow

coach/student/[id].tsx   Coach view of one client (uses /api/coach/clients/:id/summary)

eod/index.tsx            Submit today's EOD
eod/history.tsx          Trailing 30/90 day series

whatif/index.tsx         Scenario picker
whatif/[type].tsx        Run a scenario
whatif/compare.tsx       Compare two saved scenarios

settings/notifications.tsx  Toggle each NotificationPreferences flag
settings/security.tsx       Trust Center mirror

accountability.tsx       Partner widget
community.tsx            Wins feed
future-letter.tsx        Day-90 reveal of the user's onboarding letter
income-gap.tsx           Income vs lifestyle gap
interest-bleed.tsx       Daily/monthly/annual interest cost
milestones.tsx           Unlock list + celebrate animations
payday.tsx               Paycheck deploy + templates
preferences.tsx          UX preferences
priorities.tsx (in goals.tsx)  See goals.tsx
projections.tsx          Long-horizon net-worth chart
spending-dna.tsx         Monthly Spending DNA report
trust-center.tsx         Trust meta read
```

## Auth gate

`_layout.tsx` checks `authStore` on every navigation. Unauthenticated
users get bounced to `(auth)/login`. Authenticated users without
`onboarding_complete` go to `(onboarding)/quiz`. Everyone else hits
`(tabs)`.

## Deep links

The signup share link (`/signup?coach=<code>`) is parsed in
`_layout.tsx` and forwarded to `(auth)/register` via a route param so
the registration form pre-fills the coach code field. The backend
validates the code; the mobile app does no semantic validation
beyond a non-empty string.

## Tenancy / role split

- **Student** sees the standard dashboard.
- **Coach** sees the same `(tabs)` layout but the `coach.tsx` tab
  becomes a roster instead of "your coach"; `coach/student/[id]`
  drills into a single client using `coachApi.getStudentDetail`
  (or the lighter `getClientSummary` for messaging contexts).
- **Owner** sees the coach UI plus an admin entry on the profile
  page that opens the admin promote / list-coaches surfaces.

## Operations

- Adding a route: create the `.tsx` file under `app/` at the
  desired path. Expo Router picks it up automatically.
- Static SEO / share-card metadata for new routes: add to
  `app.json` `web.linking` config.
- A route that needs to render before auth completes (e.g. a
  privacy policy) goes outside the `(auth)`/`(tabs)`/
  `(onboarding)` groups so the auth gate doesn't redirect it.
