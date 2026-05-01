# Wave 9 — Storefront finance offer blocks, funnel analytics, community privacy

> **Status:** draft, documentation-only.
>
> This wave covers three intertwined surfaces:
> 1. **Storefront finance offer blocks** — the finance-tinted variant
>    of the storefront in PR #108 §01.
> 2. **Funnel analytics** — opt-in measurement of storefront → offer
>    → checkout conversion, with bucketed events and consent.
> 3. **Community rooms** — strict privacy on threaded community
>    spaces (per PR #108 §06), with money-shape scrubber + balance
>    redaction at the post layer.

## 0. Cross-repo dependencies

- **Hard:** `growth-project-mobile/docs/product/storefront-funnel-spec.md`
  (Wave 9 mobile) — declares the storefront block taxonomy + funnel
  shape. This spec adds the finance-specific obligations.
- **Hard:** This repo PR #108 §01 (`01-storefronts.md`),
  §06 (`06-community-spaces.md`) — declares the storefront / spaces
  surfaces.
- **Hard:** This repo PR #110 §02 (ledger) — funnel analytics may
  derive bands from ledger entries.

## 1. Storefront finance offer blocks

PR #108 §01 declares the storefront. This spec adds three finance
specific block kinds:

### 1.1 `OfferPriceBlock` (finance-aware)

Renders an offer with a price band (not raw amount on a
client-facing storefront where the storefront is a *public* surface).

| Field | Visibility | Notes |
|---|---|---|
| `title`, `description` | public | outcome-claim filter applied |
| `price_band` | public | `<$100`, `$100-500`, `$500-2k`, `$2k-10k`, `>$10k` |
| `price_exact` | post-application or post-checkout intent only | shown after the buyer has entered checkout flow |
| `payment_kind` | public | `one_time` / `subscription_monthly` / `payment_plan` |
| `subscription_period` | public if `subscription_monthly` | `monthly` / `yearly` |
| `cta_disclaimer` | public | verbatim from `storefront/disclaimer.constants.ts`; shown above CTA |

The `cta_disclaimer` is **always rendered** above the CTA on a
finance offer block. Verbatim copy:

```
The Growth Project is read-only over your accounts. Coaching does
not include money management; outcomes vary.
```

(Reserved-name constant; runtime PR-W9-1 lands.)

### 1.2 `TrustStripBlock` (finance-aware)

Renders trust strip (badges) derived from the bucketed signals
defined in `wave-7-discovery-trust-signals.md` §2. Excludes:

- `verified_payouts_band` (revealed only on the marketplace
  discovery card, not the storefront — overlaps with public-money).
- `fraud_signal_count_band` (negative signal; not surfaced).

Includes:

- `coach_tier` badge.
- `tenure_band` badge.
- `community_health_band` badge (if good).
- `event_attendance_band` badge (if good).

Outcome-claim filter is applied to every badge label.

### 1.3 `ApplicationGatedOfferBlock`

Renders an application-gated offer (per PR #108 §03 applications).

- Public copy: title, description, application question count,
  price band.
- Hidden until `APPROVED`: full description, price exact, deposit
  flow.
- Application form is captured on a separate screen.

The block carries a per-state visibility map; the block renderer
picks the right shape for the current viewer (anonymous, logged-in
client, applied client, approved client).

## 2. Funnel analytics

PR #108 surfaces declare events. This spec defines the **finance
funnel** events and their consent posture.

### 2.1 The funnel

```
storefront_view  →  offer_card_view  →  cta_click  →  checkout_init  →  checkout_complete
                                       ↓
                                  application_start (if gated)
                                       ↓
                                  application_submit  →  decision  →  deposit_paid  →  confirmed
```

### 2.2 Events — closed enum

```
funnel_storefront_view              { coach_id, source: 'discovery' | 'deeplink' | 'in_app' | 'external' }
funnel_offer_card_view              { coach_id, offer_kind, price_band }
funnel_cta_click                    { coach_id, offer_id, offer_kind }
funnel_checkout_init                { coach_id, offer_id, offer_kind, price_band }
funnel_checkout_complete            { coach_id, offer_id, offer_kind, price_band }
funnel_checkout_abandoned           { coach_id, offer_id, last_step }
funnel_application_start            { coach_id, offer_id }
funnel_application_submit           { coach_id, offer_id }
funnel_application_decision         { coach_id, offer_id, decision: 'approved' | 'rejected' | 'screened' }
funnel_deposit_paid                 { coach_id, offer_id, deposit_band }
funnel_confirmed                    { coach_id, offer_id }
```

**No raw amount** in any event. Every monetary field is a band.
Doctrine pin `funnel-analytics-consent.spec.ts` asserts.

### 2.3 Consent

Per `OWNER_DECISION W9_FUNNEL_CONSENT_DEFAULT`, recommendation A —
default OFF.

Coaches opt in via:

```
POST  /api/v1/coach/funnel-consent
  body: { consent: true, scope: 'this_coach' | 'org_only' | 'platform_aggregate' }
  → 200 { consented_at, consent_version }
```

Three scopes:

- `this_coach` — only this coach's funnel events flow into their
  own dashboard. **Default scope when opting in.**
- `org_only` — events flow into the org-level rollup (Wave 5
  rollup endpoints). Requires the coach to be a head_coach or
  sub_coach in an `org`.
- `platform_aggregate` — events flow into the platform-wide
  benchmark (anonymised, k-anonymity ≥ 50). Requires explicit
  re-consent every 12 months.

Consent payload is captured verbatim (the consent UX shown at the
moment of opt-in). Bumping the consent version requires re-consent.

### 2.4 Storage

```
table  funnel_events
  id                       uuid          PK
  event_kind               text          NOT NULL  -- closed enum
  coach_id                 uuid          NOT NULL
  payload_jsonb            jsonb         NOT NULL  -- bucketed payload only
  consented_scope          text          NOT NULL  -- 'this_coach' | 'org_only' | 'platform_aggregate'
  consent_version          int           NOT NULL
  posted_at                timestamptz   NOT NULL DEFAULT now()
  user_id_hashed           text          NULL  -- one-way hashed; never raw user_id
  session_id_hashed        text          NULL
  retention_until          date          NOT NULL  -- 13 months from posted_at; sweep job purges
```

The `user_id` is **hashed** before storage to support funnel
deduplication without storing PII. The hash uses a per-coach salt
rotated annually (key in env `FUNNEL_HASH_SALT_<coach_id>`; if
missing, a platform default is used and rotated weekly).

`retention_until` enforces 13-month retention; the
`FunnelRetentionSweepJob` purges expired rows daily.

### 2.5 Reads

```
GET  /api/v1/coach/funnel/summary?period=mtd|last30|last90|ytd
  → 200 {
    period: { start, end },
    storefront_views: int,        -- raw count is fine; count is not money
    offer_card_views: int,
    cta_clicks: int,
    checkout_inits: int,
    checkout_completes: int,
    abandonment_band: '0-25%' | '25-50%' | '50-75%' | '75-100%',
    -- conversion bands per offer_kind
  }
  → 412 NOT_CONSENTED        (coach has not opted in)

GET  /api/v1/coach/funnel/by-offer
  → 200 { rows: [{ offer_id, kind, ...band rollups... }, ...] }
  → 412 NOT_CONSENTED

GET  /api/v1/admin/funnel/platform-aggregate    (OWNER only)
  → 200 { ... aggregate over consented coaches ... }
  -- enforces k-anonymity ≥ 50; if a query produces fewer rows, returns 503
```

## 3. Community rooms (privacy)

PR #108 §06 declares community spaces exist. This spec adds the
privacy mechanisms.

### 3.1 Money-shape scrubber

Every post body and reply body runs through the money-shape
scrubber on **write** (not at read time, to ensure the database
never stores leaked money).

Patterns scrubbed:

- `\$\s?\d+[\d,]*\.?\d{0,2}`            → replaced with `[redacted amount]`
- `[\d,]+\.\d{2}\s*(USD|usd)`           → same
- `(\d+(\.\d+)?)\s?(?:dollars|cents)`   → same
- `(salary|income|debt|net\s*worth|balance)\s*(?:is|of|=|:)\s*\$?\d`
  → entire match replaced

The scrubber is a Zod refinement on the post body; if the post
contains money-shape **after** scrubbing, the post is rejected with
`422 MONEY_SHAPE_AFTER_SCRUB` (handles obfuscation cases).

Slow-leak detection (per PR #110 §07 anti-fraud rule 3.5) runs at
post time **and** at a daily aggregate.

### 3.2 Balance-quote redaction

When a user replies and quotes the parent post, the quote is
**re-scrubbed** independently. A reply that quotes a post which
was edited (new scrubber rules) re-applies the latest scrubber.

### 3.3 OWNER kill-switch

A space can be frozen by OWNER:

```
POST  /api/v1/admin/spaces/:id/freeze
  body: { reason: string ≥ 20 chars }
  → 200 { ok }
```

A frozen space is read-only; new posts/replies are refused.
Unfreezing is the inverse with the same payload shape. Both
audited.

### 3.4 Auto-mute on signal

Money-shape leak rule (PR #110 §07 §3.5) auto-mutes a post on
first violation post-scrubbing. The post is hidden from the feed but
the row remains in the DB for OWNER review.

The doctrine pin `community-privacy.spec.ts` asserts:

- The scrubber runs on every post-write path.
- The auto-mute flips a post's `is_muted=true` within 1s of the
  fraud signal firing.
- The OWNER kill-switch is reachable via the admin endpoint.

## 4. State-transition table — community post

| From | To | Trigger |
|---|---|---|
| (none) | `published` | post submitted, scrubber passed |
| (none) | `rejected_money_shape` | scrubber failed (terminal — post is not stored) |
| `published` | `auto_muted` | money-shape rule fires post-publish |
| `auto_muted` | `published` | OWNER reviews, dismisses |
| `auto_muted` | `removed` | OWNER reviews, accepts |
| `published` | `removed` | OWNER manual removal |
| `published` | `frozen` (read-only state on parent space) | space freeze cascades |

## 5. State-transition table — application gate

(Mirror of PR #108 §03; restated here for the storefront block
context.)

| From | To | Trigger |
|---|---|---|
| `interested` | `applied` | application submitted |
| `applied` | `screened` | OWNER / coach reviews |
| `screened` | `approved` | coach approves |
| `screened` | `rejected` | coach rejects (templated reason) |
| `approved` | `deposit_paid` | deposit transaction complete |
| `deposit_paid` | `confirmed` | grace period expires without refund |
| `deposit_paid` | `refunded` | within grace |
| any | `withdrawn` | applicant withdraws |

## 6. Privacy / security

- Funnel events: hashed user_id, bucketed amounts, 13-month TTL,
  k-anonymity ≥ 50 on platform aggregate.
- Community posts: scrubbed at write, re-scrubbed on quote, OWNER
  kill-switch, auto-mute on rule fire.
- Storefront blocks: outcome-claim filter, price-band only on
  public surfaces, `cta_disclaimer` always rendered.
- PostHog: funnel events flow through the same gateway; doctrine
  pin asserts no raw amount.

## 7. Failure modes (≥ 5)

| # | Failure | Detection | Mitigation |
|---|---|---|---|
| 1 | Funnel event captured without consent | server-side guard checks consent on every write | event is dropped server-side; no row is inserted; PostHog is also gated by the consent flag |
| 2 | Money-shape scrubber misses a Unicode lookalike (e.g. fullwidth dollar sign `＄`) | doctrine pin runs a corpus of known leakage patterns | scrubber pattern updated; corpus extended with new patterns from OWNER review queue |
| 3 | A coach revokes consent but events from in-flight checkouts are still being captured | revoke takes effect immediately on the consent flag; in-flight events post-revoke are dropped | runtime test fires events post-revoke and asserts none stored |
| 4 | Storefront `price_exact` leaks via OG-meta unfurl on a deeplink | OG-meta is generated server-side and only renders bands | doctrine pin asserts the OG-meta payload contains only `price_band`, never `price_exact` |
| 5 | OWNER freezes a space mid-post-write | the post-write transaction checks the space's frozen flag in the same Tx | refused with `423 SPACE_FROZEN`; runtime test covers |
| 6 | Outcome-claim filter is bypassed by HTML entity encoding (e.g. `\&dollar;`) | scrubber runs on rendered text, not raw HTML; a separate sanitiser strips entities first | sanitiser feeds scrubber; CI test covers |
| 7 | A platform-aggregate query with k-anonymity < 50 is run by OWNER | the query fails with `503 K_ANONYMITY_VIOLATION` | OWNER must broaden the query; the failure is itself logged as an OWNER audit event |

## 8. Acceptance criteria

- [ ] Three finance-aware storefront blocks exist (`OfferPriceBlock`,
  `TrustStripBlock`, `ApplicationGatedOfferBlock`).
- [ ] `cta_disclaimer` verbatim from `storefront/disclaimer.constants.ts`
  is rendered above every CTA.
- [ ] Funnel events: closed enum; consent default OFF; bucketed
  payloads; 13-month TTL; k-anonymity ≥ 50 on platform aggregate.
- [ ] Money-shape scrubber runs on every post-write path; doctrine
  pin asserts.
- [ ] OWNER kill-switch reachable; freeze causes
  `423 SPACE_FROZEN` on writes.
- [ ] No PostHog event carries raw amounts.
- [ ] Doctrine pins `community-privacy.spec.ts` and
  `funnel-analytics-consent.spec.ts` run in CI.

## 9. Out-of-scope (explicit)

- Public web storefront (in-app only).
- Cross-coach funnel attribution (a buyer who clicked through coach
  A's link but bought from coach B). Marketplace attribution is the
  separate Wave 7 surface.
- Per-buyer funnel personalisation. Funnel is coach-side only.
- Native group video in community rooms (PR #108 §07 deferred).
- OCR scrubber on community image attachments (deferred per
  PR #108 §06).
