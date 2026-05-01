# 01 — Coach storefronts

> **Status:** draft, documentation-only. Authorises runtime PR-FS-1 (storefront read-only) and PR-FS-2 (offers catalogue).

## 1. WHY

A finance coach inside TGP today has no public face. They manage
their roster, push a program template, send messages, and watch the
red-flags dashboard. The moment they want to onboard a new client,
they leave the app — Instagram bio, a Stan link, a Calendly URL — and
the new client lands somewhere that knows nothing about TGP, the
register, the disclaimers, or the doctrine. Then they get pushed back
into the app and onboarded a second time.

The storefront fixes that round-trip. It is the coach's in-app face:
their bio, their offer grid, their social proof, their disclaimers,
and a deeplink they can ship in any external bio. A first-time tap on
the deeplink lands a visitor on a clean install / sign-in flow that
preserves intent through to checkout, application, or community
join. The coach never has to leave the app to grow their business.

The one-line claim:

> A coach should be able to share **one link** that, when tapped,
> drops a stranger into a clean, doctrine-correct page that lists
> what the coach sells, who they are, and what the rules of
> engagement are — and from which the stranger can sign up, buy,
> apply, or join, without ever opening a browser tab.

## 2. WHEN

Mergeable as PR-FS-1 once:

- The doctrine pin (`storefront-doctrine.spec.ts`) is in place and
  green: outcome-claim filter on every coach-written field; verbatim
  disclaimers present.
- A coach moderation queue exists (PR-FS-7 ships the queue surface;
  PR-FS-1 can ship with a stub queue + OWNER-only review).
- Mobile design review has confirmed the bone/ink/oxblood palette,
  Cormorant Garamond display + Inter body, no emoji, no confetti.
- A per-coach `storefronts_enabled` boolean exists on
  `coach_profiles` (default `false`, OWNER-flippable).

PR-FS-2 (offers catalogue) follows immediately and is gated by
`OFFERS_ENABLED` × `coach_profiles.offers_enabled`. PR-FS-1 ships
with empty grids and a "More offers coming." line if the coach has
no offers; that copy is doctrine-correct.

## 3. WHERE

Runtime PR-FS-1 and PR-FS-2 will touch:

- `backend/prisma/schema.prisma` — additive: `Storefront`,
  `StorefrontMedia`, `Offer`, `OfferMedia`. No drops, no renames.
- `backend/src/storefront/` — new module, README following the
  module shape pinned in PR #82.
- `backend/src/offers/` — new module, README per same shape.
- `mobile/app/(storefront)/[slug].tsx` — read-only screen.
- `mobile/app/(storefront)/coach/edit.tsx` — coach-only editor.
- `mobile/src/api/storefront.ts`, `mobile/src/api/offers.ts` —
  Zod schemas, typed clients.
- `backend/src/compliance/disclaimers.ts` — new file, exports the
  six verbatim strings from `00-overview.md` §8.
- `backend/test/storefront-doctrine.spec.ts` — new pin.
- `mobile/test/design-doctrine.spec.ts` — extended.

`new-website/` is untouched (does not exist).

## 4. WHO

| Actor | Capability |
|---|---|
| Visitor (logged out, deeplink) | Tap deeplink → see OG-meta unfurl page (image, title, education-only line) → install / sign-in. Cannot transact or browse offers without an account. |
| L1 / L2 / L3 client | View any coach storefront they have a relationship with, plus any storefront they have explicit access to via marketplace. |
| Coach | Create / edit / publish / unpublish their own storefront. Cannot edit another coach's. |
| Coach Premium | Same as coach + access to premium offer types (gated cohort, branded media). |
| OWNER | Read all storefronts; force-unpublish; review the moderation queue for storefront copy. |
| Compliance reviewer | Read the moderation queue for storefront copy; approve / reject; route to OWNER for the actual flip. |

## 5. WHAT

### 5.1 The storefront, in plain terms

A storefront has:

- A **slug** — short, kebab-case, unique per platform, owned by the
  coach. Example: `peach1bomb`. Reservations follow a denylist (no
  "admin", "owner", "support", no four-letter expletives, no
  finance-loaded terms like "fdic", "yield", "broker"). Slug
  changes are allowed but rate-limited (1 / 30 days) and the old
  slug 301-redirects for 90 days inside the app router.
- A **name** — display name, max 60 chars, runs through the
  outcome-claim filter.
- A **headline** — one line, max 100 chars, e.g. "Quiet, evidence-
  based finance coaching." Filtered.
- A **bio** — 1–3 paragraphs (max 1,500 chars total), filtered.
- A **trust strip** — bucketed badges, never raw money. Allow-list
  of badges: "300+ clients", "5 years coaching", "L2 cohort host",
  "L3 mastermind operator". Each badge is OWNER-curated; coaches
  pick from the allow-list, do not freeform.
- An **avatar** — JPEG, 512×512, EXIF-stripped, public-read with
  random-suffix path (same posture as
  [`coach-led-programs/03-profile-avatars.md`](../coach-led-programs/03-profile-avatars.md)).
- A **cover image** — optional, 1200×400, same posture.
- An **offer grid** — ordered list of `Offer` rows the coach has
  published. Each card: title, kind, price (or "Application
  required"), one-line summary, "Buy" / "Apply" / "Subscribe" /
  "Free" CTA.
- A **social proof block** — optional, capped at 3 testimonials,
  each ≤ 240 chars, each runs the outcome-claim filter (and the
  filter is hostile to testimonials by default — see §10).
- A **footer** — verbatim `education_only` and
  `no_outcome_promise` disclaimers from
  [`00-overview.md`](./00-overview.md) §8. Cannot be removed by the
  coach. Pinned.
- A **state** — `draft` / `pending_review` / `published` /
  `unpublished` / `taken_down`.

### 5.2 Data sketch

```prisma
model Storefront {
  id                 String           @id @default(cuid())
  coach_id           String           @unique
  coach              CoachProfile     @relation(fields: [coach_id], references: [id])
  slug               String           @unique
  display_name       String           @db.VarChar(60)
  headline           String?          @db.VarChar(100)
  bio                String?          @db.VarChar(1500)
  avatar_path        String?
  cover_path         String?
  badges             String[]         @default([])  // allow-list values only
  testimonials       Json?            // capped at 3, each <= 240 chars
  state              StorefrontState  @default(draft)
  visibility         Visibility       @default(public)
  published_at       DateTime?
  created_at         DateTime         @default(now())
  updated_at         DateTime         @updatedAt
  takedown_reason    String?
  takedown_actor_id  String?
  offers             Offer[]
}

enum StorefrontState { draft pending_review published unpublished taken_down }
enum Visibility { public unlisted } // 'unlisted' = not in marketplace; deeplink works.
```

`StorefrontMedia` carries the avatar / cover signed-URL machinery in
its own table to keep the main row narrow. Same posture as PR #106
§3.

### 5.3 API sketch

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/storefronts/:slug` | optional (visitor or client) | Public read of a published storefront. Visitor sees a stripped variant — name, headline, avatar, education-only line, "Sign in to continue". |
| GET | `/api/storefronts/me` | coach | Read own storefront (any state). |
| POST | `/api/storefronts/me` | coach | Create or upsert. Always lands in `pending_review` for first publish. |
| POST | `/api/storefronts/me/publish` | coach | Submit for review. |
| POST | `/api/storefronts/me/unpublish` | coach | Coach-side unpublish. |
| GET | `/api/admin/storefronts/queue` | OWNER + compliance | Moderation queue. |
| POST | `/api/admin/storefronts/:id/decide` | OWNER + compliance | Approve / reject. |
| POST | `/api/admin/storefronts/:id/takedown` | OWNER | Hard takedown. |

Slug is reserved on first publish, not on draft. The `slug` field
runs through:

1. Length / charset regex (`/^[a-z0-9](?:[a-z0-9-]{1,30})$/`).
2. Denylist match (case-insensitive).
3. Outcome-claim filter (`from compliance.outcome_filter import filter` —
   the same filter used elsewhere; rejects words like "guaranteed",
   "yield", "fdic", "brokerage").

All **POST** routes are throttled per coach (10 / hour for edits, 1 /
30 days for slug changes). Throttle returns
`429 STOREFRONT_RATE_LIMIT`.

Error envelope is the existing shape from PR #88 (`code`,
`message`, optional `details`):

```json
{
  "code": "STOREFRONT_BLOCKED_BY_FILTER",
  "message": "The submitted copy contains a phrase the platform cannot publish.",
  "details": { "field": "headline", "matched": ["guaranteed return"] }
}
```

### 5.4 Screens & navigation

Textual storyboard. The actual layouts are produced from the spec in
the runtime PR; the doctrine pin enforces palette + type +
no-emoji.

- **`(storefront)/[slug].tsx`** — public view.
  - Top: cover image (or solid bone fill), avatar circle (oxblood
    edge), name, headline, "Education only" badge in ink.
  - Trust strip: bucket badges, single row, ink type on bone fill.
  - Bio: Cormorant Garamond display, max 3 paragraphs.
  - Offer grid: 1-column stack on phone; each card is a tap →
    `/(checkout)/offer/[id]`.
  - Social proof block (if any): each tile 240 chars max, ink on
    bone, no photos (testimonials are text-only in v1).
  - Footer: `education_only` + `no_outcome_promise` verbatim, ink on
    bone.
- **`(storefront)/coach/edit.tsx`** — coach editor.
  - Tabs: Bio, Offers, Trust, Social proof, Preview, Publish.
  - Each tab is a quiet form with inline filter feedback (red ink,
    tiny, never red bar). Submit → `pending_review` → email +
    in-app banner: "Your storefront is in review. Median time: 4
    business hours."
  - Preview tab renders the public view with a "Preview" watermark.
- **Visitor unfurl** — `(storefront)/[slug]` when the user is not
  signed in.
  - Renders avatar, name, headline, education-only line, and a single
    button "Continue with Apple / Google / Email".
  - No offer grid, no bio, no marketplace.
  - The deeplink that produced the unfurl is preserved through
    sign-in and resolves to the full view post-auth.

### 5.5 Slug + deeplink resolution

- App: `expo-linking` route `/c/:slug` resolves to
  `(storefront)/[slug]`.
- Web (unfurl only): a single edge function on the existing API
  domain (`/c/:slug.html`) returns OG meta — `og:title`,
  `og:description` (= `education_only` first sentence), `og:image`
  (the avatar at 1200×630 cropped, never per-client data). No
  transactional surface.
- The unfurl page is **not** a coach landing page; it is a 1-screen
  redirect to the App / Play Store with a deferred deeplink that
  preserves `slug` through install.

## 6. HOW (the runtime PR shape)

PR-FS-1 (storefront read-only) ships:

1. The `Storefront` + `StorefrontMedia` migration (additive).
2. `backend/src/storefront/` module, with controller, service, DTO,
   and the disclaimer constants.
3. The compliance filter (`backend/src/compliance/outcome_filter.ts`)
   if it does not yet exist (PR-FS-1 owns first ship; later
   surfaces re-use it).
4. Mobile `(storefront)/[slug].tsx` (read-only) +
   `(storefront)/coach/edit.tsx` (basic) + the `<DisclaimerBlock/>`.
5. `backend/test/storefront-doctrine.spec.ts` + extension to
   `mobile/test/design-doctrine.spec.ts`.
6. Module README at `backend/src/storefront/README.md` and a row
   in `mobile/DESIGN.md` for the new screens.

PR-FS-2 (offers catalogue) ships:

1. `Offer` + `OfferMedia` migration.
2. `backend/src/offers/` module.
3. Mobile `(storefront)/offer/[id].tsx` — read-only detail view.
4. Coach offer editor inside `(storefront)/coach/edit.tsx` Offers tab.
5. Pin: outcome-claim filter on offer title + body.

PR-FS-3 (billing wiring) is its own document — see
[`02-offers-and-checkout.md`](./02-offers-and-checkout.md).

## 7. Privacy & security

- Storefront is per-coach; the `coach_id` is the tenant. A coach
  cannot read or write another coach's storefront.
- The visitor-unfurl path returns **only** what is in `Storefront`
  (publicly publishable fields). No client-derived data, no
  testimonials with names. Testimonials display as "— Anonymous, L1
  client" or "— Anonymous, L2 cohort '24" — never real names. A
  coach can only set the *bracket*, not the name.
- Avatars and cover images: signed URLs, 24-hour expiry, EXIF
  stripped on upload (per PR #106 §3).
- Audit log row on every state transition + every coach-edit field
  change (record the field name, never the new value if it was
  rejected by filter).
- Rate-limit on storefront edit endpoint to keep the queue from
  being flooded.
- The slug owns a small attack surface (squatting, impersonation):
  reservation requires that the requesting coach's display name
  match the slug to within an editorial threshold OR an OWNER
  approves the unusual slug. Pinned by `storefront-doctrine.spec.ts`
  via a fixture.

## 8. Abuse & moderation

- **Pre-publish review** is required for the first publish of a
  storefront and for any subsequent edit that *adds* a testimonial
  or *changes* a slug. Subsequent bio/headline edits go through the
  outcome filter at write-time and a sampling QA on the queue.
- **Outcome-claim filter** rejects (verbatim list, extends per
  PR #106 §9): `guaranteed`, `risk-free`, `FDIC`, `brokerage`,
  `yield`, `principal`, `accredited`, `IRA-eligible`, `pre-IPO`,
  `we will eliminate`, `wipe your debt`, `pay off in N days`,
  `triple your savings`, `replace your income`, `\b\$\d+k\b`,
  `\b\d+%\b\s*(?:return|yield|gain|growth)\b`. Each match flips the
  state to `blocked_by_filter` and queues for human review.
- **Testimonial block**: capped at 3, each ≤ 240 chars, each
  filtered. The filter is *hostile* on testimonials — even a number
  in a testimonial trips it.
- **Reports**: any L1+ user can report a storefront from the public
  view (`Report → "Promises an outcome" / "Looks like investment
  advice" / "Other"`). Reports show in the OWNER queue with the
  context.
- **Takedown**: OWNER can hard-takedown a storefront. Hard takedown
  hides the storefront from every surface (deeplink → 404 with the
  education-only line; marketplace removal; offers suspended).
- **Slug squatting**: see §7.

## 9. Disclaimers (verbatim where they ship)

- Footer of every storefront view (visitor + L1+):
  `education_only` (verbatim).
- Footer of every storefront view, second line:
  `no_outcome_promise` (verbatim).
- Editor footer (coach view): a third inline tip, "Your bio runs
  through the outcome-claim filter. Numbers, percentages, and
  brokerage terms are rejected."

## 10. Feature flags & entitlements

Flags (global × per-coach):

| Flag | Scope | Default | Notes |
|---|---|---|---|
| `STOREFRONTS_READ_ENABLED` | global | off | Master gate. |
| `coach_profiles.storefronts_enabled` | per-coach | off | OWNER toggle; pre-condition for publish. |
| `STOREFRONTS_VISITOR_UNFURL` | global | off | Off until OG-meta surface is reviewed. |

Entitlements (capability matrix delta from PR #106 §8):

| Capability | L1 | L2 | L3 | coach | coach_premium | OWNER |
|---|---|---|---|---|---|---|
| View own coach's storefront | ✓ | ✓ | ✓ | n/a | n/a | ✓ |
| View another coach's storefront via marketplace | flag | flag | flag | n/a | n/a | ✓ |
| Edit own storefront | n/a | n/a | n/a | ✓ | ✓ | n/a |
| Use cover image | n/a | n/a | n/a | ✗ | ✓ | n/a |
| Use video offer cards | n/a | n/a | n/a | ✗ | ✓ | n/a |
| Force-unpublish | n/a | n/a | n/a | ✗ | ✗ | ✓ |

## 11. Analytics

`storefront_*` events fire from the mobile client and are no-op when
`POSTHOG_KEY` is unset. Properties carry `coach_id`, `slug`, and
`viewer_role` at minimum.

| Event | Where | Properties |
|---|---|---|
| `storefront_view` | public view mounts | slug, coach_id, viewer_role, source ('deeplink' / 'marketplace' / 'in-app') |
| `storefront_unfurl_visitor` | unfurl page | slug |
| `storefront_offer_card_clicked` | offer card tap | slug, offer_id, position |
| `storefront_publish_submitted` | coach editor | slug |
| `storefront_publish_decided` | OWNER decides | slug, decision, reasons |
| `storefront_takedown` | OWNER takedown | slug, reason |

## 12. Rollout

- Stage 0: this spec + PR-FS-1 + PR-FS-2 specs, no flag flip.
- Stage 1: `STOREFRONTS_READ_ENABLED=true` for 3 OWNER-selected
  coaches, plus their direct clients only. Slug allow-list manual.
- Stage 2: 25 coaches, slug self-serve with denylist + filter,
  marketplace listing still off.
- Stage 3: GA, marketplace integration on (per
  [`05-marketplace-discovery.md`](./05-marketplace-discovery.md)).

Kill-switch: `STOREFRONTS_READ_ENABLED=false` on the global flag
returns 503 from `/api/storefronts/*` and the mobile route shows
"Coming soon" with the education-only line; existing offers and
subscriptions are unaffected.

## 13. Tests

- `backend/test/storefront-doctrine.spec.ts`:
  - Verbatim disclaimer presence (string-equality on the constants
    + render fixture).
  - Outcome-claim filter trips on the corpus of 30 forbidden
    phrases.
  - Slug denylist denies "admin", "owner", "support", "fdic",
    "yield", "broker", "ira", "401k".
- `backend/test/storefront.controller.spec.ts`:
  - L1 user cannot edit another coach's storefront (403).
  - Unauthenticated GET on a `published` slug returns the visitor-
    redacted shape.
  - First publish lands in `pending_review`.
  - Slug change rate-limit fires after 1 / 30 days.
- `backend/test/storefront.service.spec.ts`:
  - Outcome-claim filter result is recorded in the audit log even
    when the call returns `200` (because the field was auto-
    rewritten to a safe form).
- `mobile/test/storefront-screen.spec.tsx`:
  - Renders disclaimers on every variant (visitor / L1 / L2 / L3 /
    coach preview).
  - Palette and type pass the `mobile/DESIGN.md` doctrine pin.

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Storefront becomes a sales page with outcome promises. | Pre-publish review; outcome-claim filter; hostile testimonial filter; doctrine pin. |
| Coach uses the slug to impersonate a famous brand. | Denylist; OWNER review on first publish; reports queue. |
| Visitor unfurl leaks per-client data via OG image. | OG image is a constant per coach (avatar) plus the disclaimer line; pinned. |
| Coach edits headline daily to gain marketplace ranking. | Edit rate-limit; ranker uses bucketed recency, not raw timestamps. |

## 15. Dependencies

- This spec.
- PR-FS-2 (offers catalogue) — depends on PR-FS-1.
- `mobile/DESIGN.md` doctrine.
- PR #106 §3 avatar pipeline.
- PR #120 lane #01 (flags) for the central flag service.
- PR #120 lane #03 (security/RBAC) for the OWNER guard reuse.

## 16. Acceptance criteria

For PR-FS-1:

- [ ] `Storefront` + `StorefrontMedia` migrated additively; no
      drops.
- [ ] `GET /api/storefronts/:slug` returns the visitor-redacted
      shape for unauthenticated callers and the full shape for
      authenticated.
- [ ] Coach editor saves to `pending_review` on first publish.
- [ ] Doctrine pin spec is green.
- [ ] Disclaimer block is verbatim and rendered on every variant.
- [ ] Slug denylist + rate-limit pinned.
- [ ] Module README is up-to-date.

## 17. Operator handoff

- Runbook entry `runbook/storefront.md` covers: queue review SLAs,
  takedown procedure, slug rotation, kill-switch toggle command.
- Dashboard tile (existing OWNER console): "Storefronts in review",
  "Storefronts taken down (last 30d)".
- Alert: "Outcome-filter trip rate > 5% in any 1h window" routes to
  on-call (suggests filter drift or a bot run).
- Smoke check post-deploy: `curl
  https://tgp-finance-api.fly.dev/api/storefronts/__health` returns
  `{ ok: true }` and the public unfurl renders.
