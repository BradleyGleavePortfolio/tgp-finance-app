# Wave 7 — Discovery trust signals (finance posture)

> **Status:** draft, documentation-only.
>
> The marketplace discovery feed (PR #108 §05) ranks coach
> storefronts. This spec defines the **finance-side trust signals**
> the ranker can use, the bucketing rules they obey, the editorial
> overrides + boost cap, and the outcome-claim filter that shadows
> every signal.

## 0. Cross-repo dependencies

- **Hard:** `growth-project-backend/docs/marketplace/discovery-trust-spec.md`
  (Wave 7 backend) — declares the platform-wide discovery ranker
  shape, the editorial-override mechanism, the boost factor.
- **Hard:** This repo PR #108 §05
  (`05-marketplace-discovery.md`) — declares the discovery surface
  the signals feed.
- **Hard:** This repo PR #106 §02 (`02-leaderboards.md`) —
  declares the bucketing primitives the signals reuse.

## 1. WHY trust signals at all

PR #108 §05 declares the ranker is "deterministic on bucketed
inputs only". This spec lists the bucketed inputs.

The reason a ranker exists: a marketplace with no ranker shows
chronological order, which favours the newest. A reverse-chrono
order favours the oldest. Both are gameable. A bucketed signal
based ranker rewards behaviour the platform wants:

- **Coach reliability** (do they reply to messages, do they post
  content, do they show up to events).
- **Coach community health** (low fraud signal count, low
  moderation-queue rate).
- **Coach reputation** (coach-tier per PR #106 §08).

It does **not** reward outcome metrics like client savings or
client debt-payoff — that is the consumer-finance compliance line
PR #106 §09 forbids. **No outcome-derived signal enters the
ranker.**

## 2. The closed signal list

Closed enum `discovery_signal_kind`. Adding a new signal requires
this spec to be updated **and** compliance reviewer sign-off.

| Signal | Bucketed input | Source |
|---|---|---|
| `coach_tier` | `coach` / `coach_premium` | `users.tier` (PR #106 §08) |
| `reply_band` | median reply time bucket: `<6h`, `<24h`, `<3d`, `≥3d` | `messages` table aggregate |
| `content_freshness_band` | days since last content post: `<7d`, `<30d`, `<90d`, `≥90d` | `coach_content_boards` |
| `event_attendance_band` | % attendance at coach's events: `<25%`, `25-50%`, `50-75%`, `≥75%` | `events.rsvp` aggregate |
| `community_health_band` | mod-queue auto-mute rate: `<1%`, `1-5%`, `5-10%`, `≥10%` (last is a negative signal) | `community_mod_queue` aggregate |
| `fraud_signal_count_band` | rolling 90-day fraud-signal count: `0`, `1-2`, `3-5`, `≥6` (last is a negative signal) | PR #110 §07 `fraud_signals` |
| `tenure_band` | months on platform: `<3`, `3-12`, `12-36`, `≥36` | `users.created_at` |
| `verified_payouts_band` | months with ≥ 1 successful Stripe payout: `0`, `1-3`, `3-12`, `≥12` | PR #110 §08 `reconciliation_reports` |

Every signal is a bucket. **No raw counts, no raw money, no
outcome-derived signal.**

## 3. The ranker

```
score = w_t · coach_tier_band                       // {0, 1} encoded
      + w_r · reply_band                            // {3, 2, 1, 0}
      + w_c · content_freshness_band                // {3, 2, 1, 0}
      + w_e · event_attendance_band                 // {3, 2, 1, 0}
      + w_h · community_health_band                 // {3, 2, 1, 0} (last bucket = 0)
      − w_f · fraud_signal_count_band               // {0, 1, 2, 3} (subtractive)
      + w_n · tenure_band                           // {0, 1, 2, 3}
      + w_p · verified_payouts_band                 // {0, 1, 2, 3}
      × editorial_boost                             // [1.0, 2.0]   per OWNER_DECISION W7_BOOST_CAP
```

Weights `w_*` are configured per-environment in
`backend/src/marketplace/discovery-weights.config.ts` (reserved name;
runtime PR-W7-1 lands the constants). The default weights are
calibrated to make `coach_tier` and `verified_payouts_band` the two
strongest signals.

The output is a **score**, not a position. Positions are computed at
read time per category page; ties are broken by `coach_user_id` hash
(deterministic but non-trending).

## 4. Editorial overrides

OWNER may apply an `editorial_boost ∈ [1.0, 2.0]` per coach per
category. (Per `OWNER_DECISION W7_BOOST_CAP`, recommendation A —
max 2.0×.)

```
table  discovery_editorial_overrides
  id                          uuid          PK
  coach_user_id               uuid          NOT NULL
  category                    text          NOT NULL
  boost_factor                numeric(3,2)  NOT NULL  CHECK (boost_factor BETWEEN 1.0 AND 2.0)
  reason                      text          NOT NULL  -- ≥ 20 chars
  effective_from              timestamptz   NOT NULL
  effective_until             timestamptz   NULL
  created_by                  uuid          NOT NULL  -- OWNER
  audited_at                  timestamptz   NOT NULL
```

Append-only (per the platform-wide audit posture). Replacing a boost
is a new row with the prior row's `effective_until` set to the new
row's `effective_from`.

The boost factor is **multiplicative on the score**, not on the
position. A 2× boost may move a card from rank 8 to rank 3 but never
displaces a top-ranker out of the top 3.

OWNER may **not** apply a `boost_factor < 1.0` — to reduce a coach's
visibility, the OWNER suppresses the coach from the category via a
separate `discovery_suppressions` mechanism (out of scope here;
covered by PR #108 §05 moderation queue).

## 5. Outcome-claim filter (compliance)

Every coach storefront card field that surfaces in the discovery
feed runs through the outcome-claim filter from PR #106 §09. Filter
patterns include:

- Specific dollar amounts: `\$\s?\d+`
- Specific percentages of growth: `\d+%\s+(growth|gains|return)`
- Verbs implying guaranteed outcomes: `(guarantee(d|s)?|promise(d|s)?|assured?|certain)`
- Named instruments: `(NVDA|TSLA|S&P 500|bitcoin|ETH|...)` (closed list maintained by compliance)

A field that matches is **suppressed at render time**. The card
shows the rest of the storefront with a small footer note "some
content suppressed for compliance" (verbatim copy from
`discovery/compliance-suppressed-copy.constants.ts`, reserved name).

The doctrine pin `discovery-bucketed-signals.spec.ts` asserts:

- No raw amount appears in any rank input.
- The outcome-claim filter is applied to every field rendered on a
  discovery card.
- Editorial boost is in `[1.0, 2.0]`; a row with `boost_factor`
  outside that range fails the integration test.

## 6. State / data freshness

Signals are not real-time. Each signal has a refresh cadence:

| Signal | Refresh |
|---|---|
| `coach_tier` | event-driven (on tier change) |
| `reply_band` | nightly aggregate |
| `content_freshness_band` | event-driven (on post) |
| `event_attendance_band` | weekly aggregate |
| `community_health_band` | nightly |
| `fraud_signal_count_band` | event-driven (on fraud signal insert) |
| `tenure_band` | nightly |
| `verified_payouts_band` | nightly (after reconciliation job) |

The discovery feed reads from a materialised view
`discovery_coach_signals` refreshed by the nightly aggregate run.
Event-driven signals also update the view incrementally.

A coach whose signals are missing (e.g. brand new, no payouts yet)
gets the **lowest** score in every band; their card surfaces in the
"new" sub-feed (a separate ranker that prioritises tenure-band 0).

## 7. State-transition table — editorial override

| From | To | Trigger |
|---|---|---|
| (none) | `active` | OWNER inserts row with `effective_from` ≤ now and `effective_until` null or > now |
| `active` | `superseded` | OWNER inserts a new row with same (coach, category) and `effective_from` later; the prior row's `effective_until` is set |
| `active` | `expired` | `effective_until` passes |

Append-only — no row is ever modified.

## 8. API surface

```
GET   /api/v1/marketplace/discovery?category=...&cursor=...
  → 200 { rows: [{ coach_user_id, score_band, badges, ... }, ...], next_cursor }
  -- score is bucketed in the response, not raw

POST  /api/v1/admin/discovery/editorial-override   (OWNER only)
  body: { coach_user_id, category, boost_factor, reason, effective_from, effective_until? }
  → 200 { override_id }
  → 422 BOOST_FACTOR_OUT_OF_RANGE
  → 422 REASON_TOO_SHORT

GET   /api/v1/admin/discovery/editorial-override?coach_id=...   (OWNER only)
  → 200 { rows: [...], history: [...] }
```

`Idempotency-Key` required on POST.

## 9. Privacy / security

- The discovery response carries score **bands** (e.g. `top_decile`,
  `top_quartile`, `mid`, `tail`), never the raw score.
- Coach-side cards display badges derived from bucketed signals
  (e.g. "Verified payouts ≥ 12 months"); no raw counts.
- Outcome-claim filter is applied to every text field.
- Editorial overrides are visible to OWNER; coach is **not** told
  their boost factor (avoids gaming).
- PostHog events: `marketplace_discovery_view` carries
  `category`, `result_count_band`. No score, no boost factor.

## 10. Failure modes (≥ 5)

| # | Failure | Detection | Mitigation |
|---|---|---|---|
| 1 | A new signal is added to the code without compliance review | doctrine pin `discovery-bucketed-signals.spec.ts` enumerates the closed enum | adding a signal updates this spec, the pin, and gets compliance sign-off |
| 2 | A coach games the `event_attendance_band` by having sub-coaches RSVP to their own events | self-RSVPs are excluded from the aggregate (sub-coach is in same `org_id` per PR #109) | the aggregate query joins on org_memberships and filters self-org RSVPs |
| 3 | Editorial boost is set to 5.0× by mistake (OWNER decision was 2.0×) | the CHECK constraint refuses; runtime test asserts | DB-level CHECK + API-level validation |
| 4 | The materialised view goes stale (nightly job fails) | freshness alert fires (per PR #110 §08); discovery falls back to "previous good view" | OWNER alert; cards still serve, just slightly stale |
| 5 | A coach with high fraud_signal_count rises in the feed because reply_band is also high | the ranker subtracts `w_f · fraud_signal_count_band`; in testing, w_f is calibrated so 6+ fraud signals dominates the rest | weight tuning is done in `discovery-weights.config.ts`; OWNER reviews calibration quarterly |
| 6 | An outcome-claim field slips through the filter (e.g. obfuscated by Unicode lookalikes) | community can report; OWNER review queue captures | the filter is updated; affected cards are re-rendered; doctrine pin extended with the new pattern |
| 7 | A coach's tier flips (downgrade) but the signal doesn't update for 24h | event-driven path covers tier changes; stale view is updated within minutes | a `signal_kind=coach_tier` event is fired on tier change; runtime PR's listener bumps the view row |

## 11. Acceptance criteria

- [ ] Closed `discovery_signal_kind` enum with the values in §2.
- [ ] `discovery_editorial_overrides` table exists; append-only.
- [ ] Doctrine pin `discovery-bucketed-signals.spec.ts` runs in CI.
- [ ] Editorial boost capped at 2.0× per `OWNER_DECISION W7_BOOST_CAP`.
- [ ] Outcome-claim filter applied to every card-rendered field.
- [ ] Discovery response carries bands, not scores.
- [ ] PostHog events do not carry scores or boost factors.
- [ ] Compliance sign-off captured before any signal is added.

## 12. Out-of-scope (explicit)

- ML-based ranking. v1 is deterministic on bucketed inputs.
- Per-user personalisation (ranker is global; PR-Wave-11+ may
  personalise but doctrine pin extension required).
- Outcome-derived signals of any kind.
- Public web marketplace (`new-website/` not modified).
- Reviews-with-stars; PR #108 §05 already declared this out of
  scope.
