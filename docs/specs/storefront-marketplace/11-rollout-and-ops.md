# 11 — Rollout, flags, analytics, ops, operator handoff

> **Status:** draft, documentation-only.

This document is the operator-facing layer for every runtime PR
this spec set authorises. It mirrors the shape of
[`coach-led-programs/10-rollout-and-ops.md`](../coach-led-programs/10-rollout-and-ops.md)
so an operator reading both reads the same headings.

## 1. Feature flags (consolidated)

All flags default to `off` unless noted. Flags follow the
**global × per-coach** shape from PR #106 §5: a surface is on for a
request iff both are true.

| Flag | Scope | Default | Purpose | First runtime PR |
|---|---|---|---|---|
| `STOREFRONTS_READ_ENABLED` | global | off | storefront read surface | PR-FS-1 |
| `coach_profiles.storefronts_enabled` | per-coach | off | coach-side gate to publish | PR-FS-1 |
| `STOREFRONTS_VISITOR_UNFURL` | global | off | OG-meta unfurl page | PR-FS-1 follow-up |
| `OFFERS_ENABLED` | global | off | offer catalogue | PR-FS-2 |
| `coach_profiles.offers_enabled` | per-coach | off | coach-side offer gate | PR-FS-2 |
| `OFFERS_PAYMENT_PLAN_ENABLED` | global | off | payment-plan kind | PR-FS-2 |
| `OFFERS_AFFILIATE_LINK_ENABLED` | global | off | affiliate offer kind | PR-FS-5 |
| `BILLING_ENABLED` | global | off | turn checkout on | PR-FS-3 |
| `APPLICATIONS_ENABLED` | global | off | gated programs | PR-FS-4 |
| `coach_profiles.applications_enabled` | per-coach | off | coach gate | PR-FS-4 |
| `APPLICATIONS_SNAPSHOT_ENABLED` | global | off | EOD snapshot field | PR-FS-4 |
| `AFFILIATES_ENABLED` | global | off | affiliate program | PR-FS-5 |
| `coach_profiles.affiliates_enabled` | per-coach | off | per-coach gate | PR-FS-5 |
| `REFERRALS_ENABLED` | global | off | client-to-friend referrals | PR-FS-5 |
| `REFERRALS_CREDIT_CENTS` | global | 2000 | per-referral credit (platform-funded) | PR-FS-5 |
| `AFFILIATES_PAYOUT_FLOOR_CENTS` | global | 5000 | minimum balance before payout runs | PR-FS-5 |
| `MARKETPLACE_ENABLED` | global | off | discovery feed | PR-FS-6 |
| `MARKETPLACE_KILL_SWITCH` | global | off | OWNER kill on top | PR-FS-6 |
| `MARKETPLACE_BOOST_ENABLED` | global | on | OWNER boost factor | PR-FS-6 |
| `SPACES_ENABLED` | global | off | community spaces | PR-FS-7 |
| `coach_profiles.spaces_enabled` | per-coach | off | per-coach gate | PR-FS-7 |
| `SPACES_IMAGE_ATTACH_ENABLED` | global | off | image attachments | PR-FS-7 |
| `SPACES_KILL` | global | off | global incident kill | PR-FS-7 |
| `EVENTS_ENABLED` | global | off | events / calls / replays | PR-FS-8 |
| `coach_profiles.events_enabled` | per-coach | off | per-coach gate | PR-FS-8 |
| `EVENTS_RECORDING_DEFAULT` | global | off | allow `record_default` policy | PR-FS-8 |
| `EVENTS_IRL_ENABLED` | global | off | IRL event kind (PR #122) | PR-FS-8 |
| `EVENTS_REPLAY_PERMANENT_RETENTION` | global | off | premium retention | PR-FS-8 |
| `REWARDS_ENABLED` | global | off | rewards / bounties | PR-FS-9 |
| `coach_profiles.rewards_enabled` | per-coach | off | per-coach gate | PR-FS-9 |
| `REWARDS_PLATFORM_FUNDED_ENABLED` | global | off | platform-funded shape | PR-FS-9 |
| `REWARDS_CREDIT_CAP_CENTS` | global | 5000 | per-reward cap | PR-FS-9 |
| `REWARDS_COACH_MONTHLY_CAP_CENTS` | global | 100000 | per-coach monthly fund cap | PR-FS-9 |
| `COPILOT_ENABLED` | global | off | coach AI copilot | PR-FS-10 |
| `coach_profiles.copilot_enabled` | per-coach | off | per-coach gate | PR-FS-10 |
| `COPILOT_LONGFORM_ENABLED` | global | off | recap / intake / mass-message drafts | PR-FS-10 |
| `COPILOT_PROVIDER` | global | `'perplexity'` | provider selection | PR-FS-10 |

The central flag service is per PR #120 lane #01. Every flag flip
writes an audit row.

## 2. Entitlement matrix delta

Anchor: [`coach-led-programs/08-entitlements.md`](../coach-led-programs/08-entitlements.md).

This set adds the following capability rows. Each row has the
**capability id** used in the `can(...)` resolver if the team-mode
permission shape lands (per PR #118).

| Capability id | L1 | L2 | L3 | coach | coach_premium | OWNER |
|---|---|---|---|---|---|---|
| `storefront.view_own` | ✓ | ✓ | ✓ | n/a | n/a | ✓ |
| `storefront.edit_own` | n/a | n/a | n/a | ✓ | ✓ | n/a |
| `storefront.takedown_any` | n/a | n/a | n/a | ✗ | ✗ | ✓ |
| `offer.create_one_time` | n/a | n/a | n/a | ✓ | ✓ | n/a |
| `offer.create_subscription` | n/a | n/a | n/a | ✓ | ✓ | n/a |
| `offer.create_payment_plan` | n/a | n/a | n/a | ✗ | ✓ | n/a |
| `offer.create_application_gated` | n/a | n/a | n/a | ✗ | ✓ | n/a |
| `offer.create_event_ticket` | n/a | n/a | n/a | ✓ | ✓ | n/a |
| `offer.create_content_pass` | n/a | n/a | n/a | ✗ | ✓ | n/a |
| `offer.refund_within_policy` | n/a | n/a | n/a | ✓ | ✓ | n/a |
| `order.refund_force` | n/a | n/a | n/a | ✗ | ✗ | ✓ |
| `application.apply` | ✓ | ✓ | ✓ | n/a | n/a | n/a |
| `application.screen_decide_own` | n/a | n/a | n/a | ✗ | ✓ | n/a |
| `affiliate.issue_link_own_offer` | n/a | n/a | n/a | ✓ | ✓ | n/a |
| `affiliate.issue_link_other_offer` | n/a | n/a | n/a | only with source opt-in | only with source opt-in | n/a |
| `affiliate.payout_release_force` | n/a | n/a | n/a | ✗ | ✗ | ✓ |
| `referral.create_link` | ✓ | ✓ | ✓ | n/a | n/a | n/a |
| `marketplace.browse` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `marketplace.submit_own_offer` | n/a | n/a | n/a | ✓ | ✓ | n/a |
| `marketplace.feature_set_boost` | n/a | n/a | n/a | ✗ | ✗ | ✓ |
| `space.member` | ✓ | ✓ | ✓ | n/a | n/a | n/a |
| `space.create_own` | n/a | n/a | n/a | ✓ | ✓ | n/a |
| `space.image_attachment` | per flag | per flag | per flag | n/a | n/a | n/a |
| `space.takedown_force` | n/a | n/a | n/a | ✗ | ✗ | ✓ |
| `event.schedule_own` | n/a | n/a | n/a | ✓ | ✓ | n/a |
| `event.schedule_irl` | n/a | n/a | n/a | ✗ | ✓ | n/a |
| `replay.takedown_force` | n/a | n/a | n/a | ✗ | ✗ | ✓ |
| `reward.fund_own` | n/a | n/a | n/a | ✓ | ✓ | n/a |
| `reward.fund_above_cap` | n/a | n/a | n/a | ✗ | requires OWNER approval | ✓ |
| `reward.cancel_force` | n/a | n/a | n/a | ✗ | ✗ | ✓ |
| `copilot.draft` | n/a | n/a | n/a | ✓ short surfaces | ✓ all surfaces | n/a |
| `copilot.disable_force` | n/a | n/a | n/a | ✗ | ✗ | ✓ |

## 3. Analytics catalogue (consolidated)

PostHog `analytics.capture` is a no-op when `POSTHOG_KEY` is unset
(existing posture). All events carry `coach_id` and (where
relevant) `client_id`, plus the row-specific properties below.

```text
# Storefronts
storefront_view{ slug, viewer_role, source }
storefront_unfurl_visitor{ slug }
storefront_offer_card_clicked{ slug, offer_id, position }
storefront_publish_submitted{ slug }
storefront_publish_decided{ slug, decision, reasons }
storefront_takedown{ slug, reason }

# Offers + checkout
offer_view{ offer_id, kind, source }
checkout_started{ offer_id, kind, amount_cents }
checkout_completed{ order_id, offer_id, amount_cents }
checkout_abandoned{ offer_id, kind }
subscription_renewed{ subscription_id, period_end }
subscription_cancelled{ subscription_id, source }
subscription_pastdue{ subscription_id }
refund_issued{ order_id, amount_cents, actor }
dispute_received{ order_id, amount_cents, code }
offer_blocked_by_filter{ offer_id, field, matched }

# Applications
application_started{ offer_id }
application_submitted{ offer_id }
application_screened{ offer_id, time_in_applied_h }
application_decided{ decision, time_to_decide_h }
deposit_paid{ amount_cents, offer_id }
application_confirmed{ offer_id, cohort_id }
application_refunded{ actor, reason }
application_filter_blocked{ field, matched }

# Affiliates + referrals
affiliate_link_created{ partner_coach, source_coach, offer_id, commission_bps }
affiliate_link_clicked{ code }
referral_attributed{ referrer_kind, attributed_order, gross_cents }
referral_clawed_back{ attributed_order_id, amount }
affiliate_payout_run{ partner, net_cents, period }
affiliate_paused{ partner, source_offer }
share_card_blocked_by_filter{ offer_id, matched }

# Marketplace
marketplace_feed_viewed{ category, page }
listing_clicked{ listing_id, offer_id, position }
listing_submitted{ offer_id, category }
listing_decided{ listing_id, decision }
listing_boosted{ listing_id, boost_factor }
listing_takedown{ listing_id, reason }
marketplace_filter_blocked{ offer_id, matched }

# Spaces
space_post_published{ space_id, author_role, body_len, scrubbed_tokens_count }
space_post_blocked{ space_id, kind }
post_reported{ post_id, reason }
mod_action_taken{ actor, target, action }
space_killed{ space_id, reason }

# Events / replays
event_scheduled{ event_id, scope_kind, kind }
event_rsvp{ event_id, state }
event_attended{ event_id, attendee_count_bucket }
event_canceled{ event_id, reason }
replay_uploaded{ replay_id, duration_s }
replay_caption_failed{ replay_id, kind }
replay_viewed{ replay_id, segment_count }
replay_taken_down{ replay_id, actor, reason }
event_filter_blocked{ event_id, field }

# Rewards
reward_created{ reward_id, trigger, credit_cents, audience }
reward_unlocked{ reward_id, claim_id }
reward_claimed{ claim_id }
reward_redeemed{ claim_id, order_id }
reward_expired{ claim_id }
reward_cancelled{ reward_id, actor }
reward_filter_blocked{ reward_id, field }
reward_pool_funded{ pool_id, amount_cents }
reward_pool_refunded{ pool_id, amount_cents }

# Copilot
copilot_draft_created{ surface, prompt_template_id }
copilot_draft_filter_state{ draft_id, state }
copilot_draft_blocked_by_filter{ draft_id, matches }
copilot_draft_edited{ draft_id, char_delta }
copilot_draft_sent{ draft_id, surface, sent_to_kind }
copilot_draft_discarded{ draft_id }
copilot_provider_event{ draft_id, provider, latency_ms, request_tokens, response_tokens }
```

## 4. Healthy-signal table

A surface is "healthy" when these bands hold over rolling 7 days
(unless noted). A miss does not mean rollback; it means
investigate. Hard misses (in **bold**) are pager-worthy.

| Surface | Signal | Healthy band | Hard threshold |
|---|---|---|---|
| Storefronts | publish-decision SLA | median ≤ 4 business hours | **> 24h median** |
| Storefronts | filter-trip rate on edits | < 5% of submits | **> 15%** |
| Offers | catalogue write rate | > 0 per active coach / week | **0 for 30d on a published storefront** |
| Checkout | checkout success rate (completed / started) | > 70% | **< 50%** |
| Subscriptions | past_due → active recovery | > 30% within 14d | **< 10%** |
| Subscriptions | involuntary churn rate | < 5% / 30d | **> 12%** |
| Refunds | refund rate (per coach) | < 10% / 30d | **> 20%** (auto-pause) |
| Disputes | dispute rate (global) | < 0.3% / 90d | **> 0.5%** |
| Applications | screen latency (APPLIED → SCREENED) | median ≤ 7d | **> 14d** (force-tray) |
| Applications | approval rate (per offer) | 5%–80% | **< 1% or > 95%** (FYI; suggests offer mismatch) |
| Affiliates | chargeback rate per partner | < 0.3% / 90d | **> 1.5%** (auto-pause) |
| Marketplace | queue depth | < 25 | **> 50** (page) |
| Marketplace | listing-decided latency | < 48h | **> 72h** |
| Marketplace | CTR on feed | bucketed; week-over-week stable | **> 30% drop** |
| Spaces | scrub rate | < 5% of posts | **> 10%** in any 1h |
| Spaces | takedown rate | < 5/24h | **> 15/24h** |
| Events | replay backlog | < 24h | **> 48h** |
| Events | caption failure rate | < 5% | **> 15%** |
| Rewards | trigger evaluator success | 100% | **any failure** (page) |
| Rewards | filter-trip on titles | < 2% | **> 5%** |
| Rewards | over-reservation events | 0 | **any** (data integrity, page) |
| Copilot | hard-block rate | < 5% | **> 10%** (paged; suggests filter or prompt drift) |
| Copilot | provider latency p95 | < 5s | **> 10s** (FYI) |

## 5. Kill-switch playbooks

Every flag has a kill-switch behaviour. Operator runs the flip via
the central flag service (`POST /api/admin/flags/:name`) which
writes an audit row and propagates within 60s.

| Flag | Effect when flipped to off |
|---|---|
| `STOREFRONTS_READ_ENABLED` | `/api/storefronts/*` → 503; mobile route shows "Coming soon" + education-only line. |
| `OFFERS_ENABLED` | `/api/offers/*` → 503; existing orders unaffected. |
| `BILLING_ENABLED` | `/api/checkout/sessions` → 503; existing subs continue (processor-side). |
| `APPLICATIONS_ENABLED` | `/api/applications/*` → 503; in-flight stays in current state, inbox read-only. |
| `AFFILIATES_ENABLED` | `/api/affiliates/*`, `/r/:code` → 503; payouts pause; existing attributions stay. |
| `REFERRALS_ENABLED` | `/api/referrals/*` → 503. |
| `MARKETPLACE_ENABLED` | feed empty; banner "Marketplace temporarily unavailable". |
| `MARKETPLACE_KILL_SWITCH` | wins over `_ENABLED`. |
| `SPACES_ENABLED` | `/api/spaces/*` → 503; existing posts read-only. |
| `SPACES_KILL` | every space `hidden_by_filter`; compose disabled. |
| `EVENTS_ENABLED` | `/api/events/*`, `/api/replays/*` → 503; existing replays accessible. |
| `REWARDS_ENABLED` | `/api/rewards/*` → 503; unlocked claims still redeemable. |
| `REWARDS_KILL` | unlocked claims expire next nightly run. |
| `COPILOT_ENABLED` | `/api/copilot/*` → 503; existing drafts read-only. |

## 6. Moderation queue (consolidated)

A single `mod_queue` surface owned by OWNER + compliance,
filterable by `kind`. Items:

| Kind | Source | First-publish review | Sample-audit |
|---|---|---|---|
| `storefront_copy` | PR-FS-1 | required | weekly sample |
| `offer_copy` | PR-FS-2 | required (per coach) | weekly sample |
| `marketplace_listing` | PR-FS-6 | required | weekly sample |
| `community_post` | PR-FS-7 | post-hoc + report-driven | random 1% sample |
| `replay_caption` | PR-FS-8 | required if scrub rate > 5% | always |
| `reward_title_desc` | PR-FS-9 | required | always |
| `copilot_blocked` | PR-FS-10 | n/a | weekly trend review |
| `share_card_blocked` | PR-FS-5 | n/a | always |

SLA: 4 business hours for storefronts and offers; 24h for
marketplace and rewards; 24h for replay captions; 72h for sampled
items. OWNER inactivity tray pages on > 24h depth > 25.

## 7. Capacity & cost

- **Provider tokens** (copilot): per-coach monthly cap (default
  configurable; reuses PR #117 §13).
- **Storage** (avatars, replays, content): Supabase Storage.
  Replays default to 365d retention; permanent only with
  `coach_premium` and OWNER approval per coach.
- **DB**: each surface adds 1–4 tables, all narrow with bounded
  columns; expected weekly growth dominated by orders + posts +
  copilot drafts. Estimated ≤ 1M rows/year/surface at 500 active
  coaches × 200 clients each — well within Postgres on Supabase
  with the existing index posture from PR #88.
- **Background jobs**: reminder cron (PR-FS-8), reward evaluator
  cron (PR-FS-9), payout cron (PR-FS-5), retention cron
  (PR-FS-1/8/10) — all on the existing Bun / Nest scheduler;
  no new queue infra in v1.

## 8. Operator handoff (per surface)

Each surface ships a runbook in `runbook/<surface>.md`. Each
runbook covers, at minimum:

- Daily checks (queue depth, healthy-signal table).
- Common tasks (refund, takedown, kill-switch flip, capacity bump).
- Escalation (when to page; when to involve compliance; when to
  involve counsel).
- Smoke-check post-deploy (curl + mobile open).
- Secrets rotation (provider keys, processor keys).

The consolidated **operator-on-the-hook** matrix:

| Surface | Owner | Reviewer | Pager |
|---|---|---|---|
| Storefronts | Bradley | Compliance | OWNER |
| Offers + checkout | Bradley | Compliance + Counsel | OWNER + on-call |
| Applications | Bradley | Compliance | OWNER |
| Affiliates | Bradley | Compliance + Counsel | OWNER |
| Marketplace | Bradley | Compliance | OWNER |
| Spaces | Bradley | Compliance | OWNER + on-call |
| Events / replays | Bradley | Compliance | OWNER |
| Rewards | Bradley | Compliance + Counsel | OWNER |
| Copilot | Bradley | Compliance | OWNER + on-call |

## 9. Rollout sequence (cross-surface)

The **catalogue-first** principle keeps any one runtime PR small.
The recommended order:

1. **Foundation** — PR-FS-1 (storefront read-only) + PR-FS-2
   (offers catalogue, no billing).
2. **Commerce** — PR-FS-3 (billing wiring, default off).
3. **Discovery** — PR-FS-6 (marketplace).
4. **Community** — PR-FS-7 (spaces).
5. **Cohorts** — PR-FS-4 (applications) + PR-FS-8 (events / replays).
6. **Growth loops** — PR-FS-5 (affiliates / referrals) + PR-FS-9
   (rewards).
7. **Coach AI** — PR-FS-10 (copilot).
8. **Doctrine pin extension** — PR-FS-12 (catch-all, extends
   `mobile/DESIGN.md` + `design-doctrine.spec.ts` for new screens).
9. **Operator console** — PR-FS-11 (the OWNER queue / dashboard /
   refunds / flag panel surfaces, each fed by the runbooks).

Each PR ships behind its own flag(s); each is independently
revertable; each carries its own README; each extends doctrine pins
without branching.

## 10. Acceptance criteria for the consolidated rollout

The spec set is "done" (mergeable as-is, with the runtime PRs
authorised but not landed) when:

- [ ] Every flag in §1 is named with default + scope.
- [ ] Every capability row in §2 is named with id + matrix entry.
- [ ] Every event in §3 has `coach_id` (and `client_id` where
      relevant) and the listed properties.
- [ ] Every signal in §4 has a band + a hard threshold.
- [ ] Every flag in §5 has a kill-switch behaviour named.
- [ ] The moderation queue table in §6 lists every surface.
- [ ] Capacity / cost in §7 has an estimate.
- [ ] Each surface has an owner / reviewer / pager listed in §8.
- [ ] The rollout sequence in §9 is consistent with each spec's
      §12 / §15 dependencies.

## 11. Known unknowns

These remain open and are expected to be answered by the runtime
PRs (or by counsel before the runtime PR is mergeable):

1. **Processor choice**: Stripe is assumed; founder may pick
   another. This spec is processor-agnostic where possible.
2. **Tax handling**: Stripe Tax integration is a follow-up.
3. **Captioning provider**: chosen in PR-FS-8 runtime.
4. **Recording-pull from Zoom/Meet**: deferred; v1 is manual
   upload.
5. **Branded instance / white-glove**: deferred; not in scope.
6. **Public web coach profile (finance)**: deferred; depends on
   compliance sign-off after fitness goes first.
7. **Copilot provider for long surfaces**: Anthropic vs Perplexity;
   decided in PR-FS-10.
8. **Per-coach voice tuning**: depends on PR #121 #24 acceptance.
9. **Outcome-claim corpus drift**: the corpus is centralised in
   `backend/src/compliance/outcome_filter.ts` and versioned; the
   doctrine pin re-runs on every change. Long-term governance is
   PR #120 lane #08.

## 12. Cross-references

- This spec set's [`README.md`](./README.md), [`00-overview.md`](./00-overview.md),
  and the per-surface specs `01-` through `09-`.
- [`10-gap-map.md`](./10-gap-map.md) — every row of PR #106 and
  fitness PRs #117–#123 mapped against this set.
- PR #106 in this repo for the delivery primitives.
- PR #117–#123 in `growth-project-backend` for the platform
  context.
- `mobile/DESIGN.md` — the doctrine.
- `backend/docs/MONEY.md` — Decimal handling for transactions.
- `backend/docs/TENANCY.md` — tenant boundary.
