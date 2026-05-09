# Coach module — quick reference

The `mobile/app/coach/` tree is the Stage 2 Coach Operating System for
The Growth Project: Finance. It mirrors (in patterns + intent — not
1:1 in feature names) the 18+ coach screens in the fitness app. The
finance app shipped with one coach screen pre-Stage 2; this module
brings it to functional parity.

## Layout

```
coach/
├── _layout.tsx                       Stack navigator (slide_from_right; bone bg)
├── index.tsx                         CoachHome — dashboard, single round-trip
├── analytics/
│   └── index.tsx                     Practice analytics — KPIs + roster wealth
├── clients/
│   ├── index.tsx                     ClientsList — search/filter/sort
│   └── [id]/
│       ├── index.tsx                 ClientDetail — 7 tabs, lazy-loaded
│       ├── notes.tsx                 Notes editor (CRUD)
│       └── assignments.tsx           Assignments management (CRUD)
├── community/
│   ├── index.tsx                     Coach-authored posts list
│   └── new.tsx                       Compose post
├── messages/
│   ├── index.tsx                     Inbox — one row per coach/client thread
│   └── [clientId].tsx                Thread — sticky composer, day dividers
├── settings/
│   └── index.tsx                     Coach profile + branding/payments stubs
└── student/                          (legacy; pre-Stage 2 single-screen view)
    └── [id].tsx                      Kept for back-compat with old deep-links
```

## Navigation entry

Coaches enter via `app/(tabs)/coach.tsx`. The legacy `CoachDashboard`
stays mounted there as a fallback through the TestFlight rollout, but
the new Stage 2 module is one tap away via the "NEW · COACH OS" ribbon
at the top.

## API client

Every screen consumes `coachApi` (`src/services/api.ts`). The full
typed contract lives in `src/types/coach.ts` — no `Record<string,
unknown>` survives in the wire path.

## Shared primitives

Reusable UI pieces specific to the coach module live in
`src/components/coach/`:

| Component         | Purpose |
|---                |---|
| `CoachSkeleton`   | Reduce-Motion-aware shimmer for loading states |
| `CoachSkeletonList` | N-row stack of skeletons |
| `CoachEmptyState` | Branded empty + error states with optional retry |
| `CoachSearchBar`  | EHR-style search input with clear button |
| `CoachTabBar<T>`  | Horizontal segmented tabs (used inside ClientDetail) |
| `CoachStatusPill` | Small chip — `good` / `warn` / `bad` / `neutral` tones |

## Conventions

- **Typography rhythm**: `eyebrow → serif headline → body lede`.
  Eyebrow uses `typography.scale.eyebrow` + `typography.families.medium`.
  Serif headlines are Cormorant Garamond at weight 400 (no bold serif).
- **Loading**: skeletons over spinners. Fall back to spinners only
  inside `LoadingSpinner` from `src/components/ui/`.
- **Empty states**: use `CoachEmptyState`. Copy is specific to the
  surface — never "No data yet."
- **Errors**: use `CoachEmptyState` with `tone="error"` and an
  `actionLabel="Retry"` handler.
- **Accessibility**: every Pressable has `accessibilityRole` +
  `accessibilityLabel`. SVG/visual elements use `accessibilityRole="image"`
  with a descriptive label.
- **Reduce Motion**: `CoachSkeleton` checks `AccessibilityInfo.is
  ReduceMotionEnabled()` and skips the ping-pong when on. Apply the
  same pattern to any new animation.

## Backend

All screens hit the `api/coach/*` namespace. See
`backend/src/coach/coach.controller.ts` and
`backend/src/coach/coach.service.ts` for the source of truth on
payload shapes. Stage 2 endpoints:

```
GET    /api/coach/dashboard
GET    /api/coach/clients
GET    /api/coach/clients/:id/summary
GET    /api/coach/clients/:id/accounts
GET    /api/coach/clients/:id/cashflow
GET    /api/coach/clients/:id/goals
GET    /api/coach/clients/:id/notes
GET    /api/coach/clients/:id/assignments
GET    /api/coach/clients/:id/messages
POST   /api/coach/clients/:id/assignments
POST   /api/coach/clients/:id/messages
GET    /api/coach/messages
PATCH  /api/coach/notes/:id
DELETE /api/coach/notes/:id
PATCH  /api/coach/assignments/:id
DELETE /api/coach/assignments/:id
GET    /api/coach/community/posts
POST   /api/coach/community/posts
PATCH  /api/coach/community/posts/:id
DELETE /api/coach/community/posts/:id
GET    /api/coach/analytics
```

Existing Stage 1 endpoints (`/students`, `/students/:id`,
`/students/:id/detail`, `/alerts`, `/notes/:student_id`, `/digest`,
`/templates`, `/templates/:id/apply/:student_id`) are unchanged.

## Stage 3 boundary

Stage 3 ships:
- Real-time delivery for messages (websockets / push fan-out).
- The federation handshake that unifies fitness + finance rosters
  for "both pillars" coaches.
- Coach branding, public coach link, payment links (Stripe), calendar
  integration. The Settings screen pre-shows these as disabled rows.
- Chart sparklines on the dashboard tiles + scheduled publish for
  community posts.
