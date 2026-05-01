# 05 — Marketplace discovery

> **Status:** draft, documentation-only. Authorises runtime PR-FS-6 (marketplace).

## 1. WHY

Storefronts plus offers plus checkout get a coach's existing clients
into the offer flow. **Discovery** gets a *new* client into a
coach's flow. Today TGP: Finance has no in-app discovery surface.

We could ship a public web marketplace. We will not in v1, for two
reasons. First, public web outcome-claims are a regulatory hazard
that we cannot moderate at the speed they post. Second, the
register on the web is not bone/ink/oxblood; the moment we let a
public marketplace render, the doctrine breaks. So the marketplace
is **in-app**, available to authenticated users, ranked
editorially, and bucketed-only on every visible signal.

The one-line claim:

> An L1+ user can browse a clean, category-scoped, ranked feed of
> coach offers inside the app; every card carries the education-
> only line, no money figure appears in the rank or the display,
> and OWNER can override any listing in seconds.

## 2. WHEN

PR-FS-6 ships once:

- PR-FS-1 (storefront) and PR-FS-2 (offers) are merged.
- The editorial-override matrix is approved.
- The ranker's no-money corpus is pinned.
- A separate `MARKETPLACE_ENABLED` flag exists.

## 3. WHERE

- `backend/prisma/schema.prisma` — `MarketplaceListing`,
  `MarketplaceCategory`, `MarketplaceOverride`.
- `backend/src/marketplace/`.
- `mobile/app/(marketplace)/` — feed, category, search, listing.
- `backend/test/marketplace-rank.spec.ts`,
  `backend/test/marketplace-override.spec.ts`.

## 4. WHO

| Actor | Capability |
|---|---|
| L1+ client | Browse the feed, search, filter by category, tap into a coach storefront or an offer. Cannot transact from the marketplace card; must enter the storefront/offer first. |
| Coach | Submit own offers for marketplace inclusion (default off). Each submitted offer goes to the moderation queue. |
| OWNER | Approve / reject submissions; pin / boost editorial picks; ban offers; tune ranker weights via a kept-narrow JSON config (versioned). |
| Compliance | Spot-check submissions for outcome claims. |
| Visitor (logged out) | Sees nothing — marketplace is L1+. |

## 5. WHAT

### 5.1 The listing

A `MarketplaceListing` is a thin pointer to an `Offer` plus the
editorial controls. It carries:

- `offer_id`
- `category` (closed enum: `debt_payoff`, `savings_focus`,
  `behavior_streaks`, `cashflow_planning`, `mindset_and_habits`,
  `events_and_calls`, `general_finance` — additive only)
- `state` (`pending_review` / `published` / `featured` / `hidden`
  / `taken_down`)
- `editorial_position` (nullable int — for "featured" placement)
- `boost_factor` (0.5 .. 2.0, default 1.0 — OWNER only; logged in
  audit)
- `submitted_at`, `decided_at`, `decided_by`

### 5.2 Feed shape

The feed is **paginated and ranked**, not chronological.

- Top section: 3–5 *featured* (editorial pin, hand-picked).
- Body: paginated ranker output.
- A "category strip" (chips) lets the user filter to one category
  at a time.

### 5.3 Ranker (deterministic, debuggable)

```
score = base_quality
      * recency_bucket
      * coach_health_bucket
      * category_relevance
      * boost_factor
```

Every input is **bucketed**:

- `base_quality`: bucketed signal of "how filled-out is the
  storefront + offer" (cover image, bio, ≥1 testimonial, refund
  policy explicit, ≥1 paid order in last 90 days). Buckets: `0.5`
  / `1.0` / `1.2`.
- `recency_bucket`: how recently the offer was edited. Buckets:
  edited <30d → 1.1, 30..180 → 1.0, >180 → 0.8. Edits to dummy
  copy do not count (filter trip exempts).
- `coach_health_bucket`: derived from the coach health tile in the
  unified admin console (red flags, refund rate, dispute rate).
  Buckets: green → 1.1, yellow → 1.0, red → 0.4.
- `category_relevance`: matches user's primary priority level (per
  the existing `Priority Waterfall`) → 1.2; matches one of their
  secondary priorities → 1.0; else → 0.8.
- `boost_factor`: OWNER override only; default 1.0.

**Money never enters the score.** Pinned by
`backend/test/marketplace-rank.spec.ts`. The ranker is unit-
tested against fixtures and the score is fully deterministic given
the inputs (no ML model, no randomness in v1).

### 5.4 Listing card display

The card shows:

- Coach avatar (small).
- Offer title (filtered).
- One-line summary (filtered).
- Kind badge ("Subscription", "Application required", "Free", etc.).
- Category badge.
- "Education only" label.
- Price *band*, not the raw price ("Under $200", "$200–$500",
  "$500+", "Application — pricing on apply", "Free"). The raw
  price shows only inside the offer detail.

The price band is computed server-side; coach cannot override it.
This keeps the discovery surface free of "$10k!" type displays.

### 5.5 API sketch

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/marketplace/feed` | client | Ranked feed; supports `?category=...&page=...`. |
| GET | `/api/marketplace/listings/:id` | client | Listing detail. |
| POST | `/api/marketplace/listings` | coach | Submit own offer for inclusion. |
| GET | `/api/admin/marketplace/queue` | OWNER + compliance | Review queue. |
| POST | `/api/admin/marketplace/listings/:id/decide` | OWNER + compliance | Approve / reject / feature. |
| POST | `/api/admin/marketplace/listings/:id/boost` | OWNER | Set boost_factor. |
| POST | `/api/admin/marketplace/listings/:id/takedown` | OWNER | Hard takedown. |

Search is intentionally simple in v1: substring match against
`title` + `summary`, scored within the category-scoped feed. No
fuzzy ML re-ranker.

## 6. HOW (the runtime PR shape)

PR-FS-6 ships:

1. The three schemas.
2. `backend/src/marketplace/` with the ranker module (pure
   function), the queue + override controllers, and the moderation
   queue extension.
3. Mobile feed + listing screens.
4. Pin: `marketplace-rank.spec.ts`,
   `marketplace-override.spec.ts`, plus an extension to the
   storefront doctrine pin to cover marketplace-card copy.

## 7. Privacy & security

- The feed never exposes per-coach raw counts; only buckets.
- The feed never exposes a real money figure.
- A user's `Priority Waterfall` is read locally per request
  (cached at session boundary) to compute `category_relevance`; it
  is not sent to the client.
- `coach_health_bucket` is derived from existing coach-health
  signals (no new data).
- GDPR scrub: marketplace listings are coach-owned; no
  client-derived data lives here.

## 8. Abuse & moderation

- Every submission goes to the queue. Outcome filter on offer copy
  fires the same; a flag-trip sticks the listing in
  `pending_review`.
- A per-coach surface budget: a single coach owns at most N feed
  slots in the top page (default 1; OWNER override). This stops
  one coach from monopolising discovery.
- A per-category boost cap: featured slots can include at most M
  offers from any single coach (default 1).
- Reports queue: any L1+ can report a listing; reports show in the
  OWNER queue alongside submissions.
- `MARKETPLACE_KILL_SWITCH` returns an empty feed if flipped.

## 9. Disclaimers (verbatim)

- Top of feed:
  "These offers are coach-led. The Growth Project does not
  guarantee approval, an outcome, or a financial result. Education
  only."
- On every card:
  `education_only` (one-line variant).
- On every listing detail:
  `no_outcome_promise` + a "Reviewed by The Growth Project on
  $date" line that surfaces the moderation date (not the reviewer
  identity).

## 10. Feature flags & entitlements

| Flag | Default | Notes |
|---|---|---|
| `MARKETPLACE_ENABLED` | off | global. |
| `MARKETPLACE_KILL_SWITCH` | off | OWNER-only kill on top of `_ENABLED`. Flip wins. |
| `MARKETPLACE_BOOST_ENABLED` | on | OWNER-controllable boost factor; off if we ever need to disable boosts entirely. |

| Capability | client | coach | coach_premium | OWNER |
|---|---|---|---|---|
| Browse feed | ✓ | ✓ | ✓ | ✓ |
| Submit own offer | n/a | ✓ | ✓ | n/a |
| Approve / reject / feature | n/a | n/a | n/a | ✓ |
| Set boost | n/a | n/a | n/a | ✓ |

## 11. Analytics

| Event | Where | Properties |
|---|---|---|
| `marketplace_feed_viewed` | feed mounts | category, page |
| `listing_clicked` | tap on card | listing_id, offer_id, position |
| `listing_submitted` | coach submits | offer_id, category |
| `listing_decided` | OWNER decides | listing_id, decision |
| `listing_boosted` | OWNER sets boost | listing_id, boost_factor (logged) |
| `listing_takedown` | OWNER takedown | listing_id, reason |
| `marketplace_filter_blocked` | filter trips on submission | offer_id, matched |

## 12. Rollout

- Stage 0: spec.
- Stage 1: PR-FS-6 ships with `MARKETPLACE_ENABLED=false`. Internal
  QA on fixture data.
- Stage 2: enabled for 50 OWNER-selected clients; coaches submit
  manually; first 100 listings reviewed by hand.
- Stage 3: open submission; queue staffed; SLA 48h.
- Stage 4: GA; ranker tuning published in
  `backend/docs/MARKETPLACE.md`.

Kill switch: `MARKETPLACE_KILL_SWITCH=true` returns an empty feed
and a "Marketplace temporarily unavailable" banner. Existing
storefronts and offers are unaffected.

## 13. Tests

- `backend/test/marketplace-rank.spec.ts`:
  - Money tokens in any input are rejected.
  - Score is deterministic per fixtures.
  - Boost only affects rank when applied; logged in audit.
  - Per-coach surface budget caps respected.
- `backend/test/marketplace-override.spec.ts`:
  - OWNER can pin / takedown / boost; coach cannot.
  - Audit row written on every override.
- `backend/test/marketplace-doctrine.spec.ts`:
  - Card display does not include raw price; band only.
  - Disclaimers verbatim.
- `mobile/test/marketplace-screen.spec.tsx`:
  - Palette + type pinned.
  - Empty-state copy is doctrine-correct.

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Pump-and-dump of one coach. | Per-coach surface budget; OWNER kill-switch; boost cap. |
| Outcome promises slip through. | Outcome filter on submission + on edit; queue depth alarm. |
| Ranker becomes a money quote. | Pinned no-money corpus; ranker is a pure function with bucketed inputs only. |
| OWNER boost abuse. | Audit log on every boost; OWNER actions reviewed weekly. |
| User sees same listings forever (staleness). | Recency bucket; rotation in the featured slot weekly. |

## 15. Dependencies

- PR-FS-1 (storefront).
- PR-FS-2 (offers).
- Existing coach-health tile (admin federation surface).
- Existing `Priority Waterfall` (`backend/src/priorities/`).

## 16. Acceptance criteria

- [ ] Schema migrated.
- [ ] Ranker pure function, deterministic, no money inputs.
- [ ] Disclaimers verbatim on feed + card + detail.
- [ ] OWNER override audit logged.
- [ ] Per-coach surface budget pinned.

## 17. Operator handoff

- Runbook: `runbook/marketplace.md` — queue triage, boost criteria,
  takedown procedure, ranker tuning checklist (when to alter
  bucket thresholds), kill-switch flip.
- Dashboard tiles: feed views / day, click-through rate (bucketed),
  queue depth, takedown count / 30d.
- Alerts: queue depth > 50 (page); CTR drop > 30% week-over-week
  (FYI; investigate); listing-decided latency > 72h (page).
