# 00 — Overview: TGP: Finance one-stop-shop

> **Status:** draft, documentation-only. Sibling to [`coach-led-programs/`](../coach-led-programs/). No runtime change.

## 0. The one-line claim

> A finance coach should be able to run their entire business — sell
> programs, take deposits, manage subscriptions, screen applicants,
> grow with affiliates, host calls, build community, reward goal
> hits, and operate with an AI copilot — **inside TGP: Finance**,
> without ever putting a dollar amount on a leaderboard, promising
> an outcome, or violating the consumer-finance line.

## 1. WHY this spec set exists

Two pressures converge:

1. **Coaches keep leaving the app to transact.** They drive clients
   into TGP for the daily check-in, the net-worth ledger, the
   What-If runners, the AI coach — then send the same clients to
   Stan / Kajabi / Whop / Stripe links / Calendly / Discord to
   actually buy, schedule, and discuss. Each leak is a place the
   coach can be undercut, the brand fragments, and the platform
   loses the engagement loop. Whop's pitch — "everything for your
   business, in one place" — applies just as well to a finance
   coach with a 200-person community as it does to a trader with a
   Discord. We want that pitch but inside the editorial register
   already pinned by `mobile/DESIGN.md`.
2. **The fitness side is going there first.** Backend PRs #117–#123
   land the architecture (AI Program Builder, Team Mode, public
   profiles, program templates, revenue dashboard, masterminds,
   coach-experience wave). Finance must either match or
   intentionally fall behind. The cross-cutting concerns —
   entitlements, flags, compliance, billing, audit, observability —
   are *shared* via PR #120 platform-readiness lanes. Diverging
   silently is the failure mode we are pre-empting with this spec
   set.

The unique constraint, and the reason this is **not** a port of the
fitness spec set, is the **consumer-finance line**: an outcome
promise, a yield word, a number-on-a-leaderboard, a "pay me $1k and
I will get you out of debt" landing-page lift on a coach storefront —
each of these is a legal hazard the fitness side does not carry. The
boundary is documented in
[`coach-led-programs/09-compliance.md`](../coach-led-programs/09-compliance.md)
and extends throughout this set unchanged.

## 2. WHEN this can ship

This spec set is mergeable as soon as:

- A consumer-finance compliance reviewer signs off on the disclaimers
  and outcome-claim filter pinned in §8 of this overview and in
  [`02-offers-and-checkout.md`](./02-offers-and-checkout.md) §9,
  [`05-marketplace-discovery.md`](./05-marketplace-discovery.md) §9,
  [`08-rewards-bounties.md`](./08-rewards-bounties.md) §9, and
  [`09-ai-copilot.md`](./09-ai-copilot.md) §9.
- A reviewer confirms every downstream spec hits the 16 required
  sections listed in [`README.md`](./README.md).

The downstream **runtime** PRs each carry their own merge gates:

| Runtime PR | Hard gates before it can ship |
|---|---|
| Storefronts (read-only) | Doctrine pin extension; no outcome copy in seed data; per-coach flag; OWNER moderation queue. |
| Offers + checkout (no payments) | Stripe (or chosen processor) account decision; refund + dispute policy approved; receipt-page disclaimer pinned; `BILLING_ENABLED` flag default off. |
| Payments live | Compliance sign-off on receipt copy and dunning; Sentry filters PCI; refund SLA documented; ops on-call rota; PR #120 lane #05 (billing packaging) accepted. |
| Applications | KYC-lite copy approved (no KYC promised); deposit refund states named; PR #122 (masterminds spec) accepted (defines the application state machine we share). |
| Affiliates | FTC disclosure copy approved; payout-floor + chargeback-clawback rules named; abuse rate-limit shaped. |
| Marketplace discovery | Editorial override matrix approved; rank features documented; outcome-claim filter pinned. |
| Community spaces | Moderation queue staffed; scrubbing list extended; content-policy copy approved. |
| Events / calls / replays | Recording-consent UX approved; captioning provider chosen; storage bucket + retention named. |
| Rewards / bounties | Compliance sign-off on "no prize promotion / no yield / no gambling"; coach-funded vs platform-funded distinction approved; tax disclosure copy approved. |
| AI copilot | Doctrine-pin extension; tool allow-list approved; coach-business model split (drafts) vs client model (read-only finance education) named. |

## 3. WHERE this lives in the codebase

This spec set lives entirely under
`docs/specs/storefront-marketplace/`. The runtime PRs that follow
will touch (in approximate order of arrival):

- `backend/prisma/schema.prisma` — `Storefront`, `Offer`,
  `Subscription`, `Order`, `RefundEvent`, `Application`,
  `AffiliateLink`, `ReferralAttribution`, `MarketplaceListing`,
  `Space`, `Post`, `Reply`, `Event`, `Replay`, `Reward`,
  `RewardClaim`, `CopilotDraft` (each landed additively, never as a
  single mega-migration).
- `backend/src/storefront/`, `backend/src/billing/`,
  `backend/src/applications/`, `backend/src/affiliates/`,
  `backend/src/marketplace/`, `backend/src/community/`,
  `backend/src/events/`, `backend/src/rewards/`,
  `backend/src/copilot/` — one module per concern; flag-gated; each
  exposes its own README following the module-level shape pinned in
  PR #82 (`docs: enterprise-grade per-module READMEs`).
- `mobile/app/(storefront)/`, `mobile/app/(checkout)/`,
  `mobile/app/(marketplace)/`, `mobile/app/(community)/`,
  `mobile/app/(events)/`, `mobile/app/(rewards)/` — Expo Router
  segments. Each segment is feature-flag-gated and inherits the
  bone/ink/oxblood palette without exception.
- `mobile/src/api/storefront.ts`, `mobile/src/api/billing.ts`, etc.
  — Zod-validated client modules per
  [`backend/docs/MONEY.md`](../../../backend/docs/MONEY.md).
- `mobile/test/design-doctrine.spec.ts` — extends the existing
  doctrine pin to cover the new screens.
- `backend/test/storefront-doctrine.spec.ts`,
  `backend/test/marketplace-rank.spec.ts`,
  `backend/test/rewards-compliance.spec.ts` — new pinning specs.

`new-website/` is **explicitly out of scope** and not present in this
repo (verified). No marketing-site change is part of this set.

## 4. WHO

| Role | Sees | Can do |
|---|---|---|
| **Visitor** (logged out, deeplink) | Coach storefront *unfurl* (OG meta only — title, image, disclaimer line). Tap → install / sign-in. | Nothing transactional. |
| **L1 client** (free / trial / base SaaS) | Their coach's storefront, the marketplace feed, community spaces they have access to, their reward progress, the AI client coach (existing). | Buy a one-time offer, subscribe, apply for a gated program, refer a friend, attend an event, claim an unlocked reward. |
| **L2 client** (paid tier) | Everything L1 sees, plus L2-only spaces, replays, and offers. | Everything L1 can do, plus enrol in L2 cohorts and claim L2-tier rewards. |
| **L3 client** (mastermind / branded) | Everything L2 sees, plus L3-only cohort space, IRL event surface (per [PR #122](https://github.com/BradleyGleavePortfolio/growth-project-backend/pull/122)), concierge tracker. | Everything L2 can do, plus pay a deposit, complete an application, attend IRL. |
| **Coach** (`coach`) | Their own storefront, their offers, their applications inbox, their affiliate dashboard, their community spaces, their events, their rewards roster, their AI copilot drafts, their analytics. | Create / edit / suspend offers, screen applications, post in community, schedule events, fund rewards, draft messaging via AI copilot, see revenue dashboard. |
| **Coach Premium** (`coach_premium`) | Everything coach sees, plus video offer types, branded-instance request, advanced AI copilot tools (per PR #122). | Everything coach can do, plus the premium-only offer types and AI tools. |
| **OWNER** | All coaches' surfaces (read-only, audited), the moderation queue, the marketplace editorial controls, the global flag panel, the disputes inbox. | Moderation actions, editorial overrides, refund overrides, kill switches, flag changes. |
| **Compliance reviewer** (concierge, no role yet — pending) | Storefront and offer copy in a review queue; AI copilot drafts flagged by the outcome-claim filter; community posts in queue. | Approve / reject copy; route to OWNER for action. |

OWNER role is already gated by `RoleGuard` (`backend/src/auth/`) per
PR #81 (`feat(authz): Phase 1B/1C — OWNER role, coach invites,
source-of-truth gating`). The compliance-reviewer role is added in
the same runtime PR that ships the moderation queue.

## 5. WHAT is the architecture

### 5.1 The objects, in plain terms

- A **storefront** is a coach-owned page inside the app: bio,
  trust strip, offer grid, social proof, deeplink, slug.
- An **offer** is a sellable thing on a storefront: a one-time
  program, a subscription, an application-gated cohort, a deposit-
  then-balance package, a payment-plan course, a content-board
  pass, an event ticket, an affiliate link from another coach
  (resolved server-side).
- An **order** is the record of a checkout. Orders are billed,
  refunded, charged-back, or rolled into a subscription.
- A **subscription** is a recurring order with dunning state.
- An **application** is a screening artefact for gated offers
  (mastermind, 1:1, cohort with limited seats). Application →
  approval → deposit → onboarding.
- An **affiliate link** is a coach-issued or platform-issued link
  with attribution; payouts and clawbacks are tracked separately.
- The **marketplace** is the platform-level discovery feed of
  listings (each listing is a thin reference to an offer, with
  editorial controls).
- A **space** is a community surface scoped to a coach, an offer, or
  a cohort. Threads + replies + pins. Money never appears.
- An **event** is a live coaching call, AMA, or cohort session;
  with reminders, attendance, optional recording, and a replay.
- A **reward** is a goal-locked unlock — coach-funded or platform-
  funded — that fires when a *behavioural* milestone is hit
  (savings deposit, debt-payoff bracket, spending-streak length).
  Never a yield, never a prize draw, never gamble-shaped.
- The **AI copilot** is the coach-business model: drafts replies,
  recaps, intake summaries, listing copy. The existing client AI
  coach is unchanged in scope (read-only finance education).

### 5.2 The shape (entity sketch)

```
            ┌─────────────┐
            │   Coach     │ (existing CoachProfile)
            └──────┬──────┘
                   │ 1
        ┌──────────┴──────────┐
        │ 1                   │ 1
   ┌────▼─────┐         ┌─────▼──────┐
   │Storefront│         │AffiliateLnk│
   └────┬─────┘         └────────────┘
        │ 1..n
   ┌────▼─────┐
   │  Offer   │◀─────┐
   └────┬─────┘      │
        │ 1..n       │ 0..n
   ┌────▼──────┐  ┌──▼────────────┐
   │  Order    │  │ Application   │
   └────┬──────┘  └───┬───────────┘
        │ 1..1        │ 1..1
   ┌────▼─────┐   ┌───▼─────────┐
   │Subscript │   │ DepositPay  │ (one-time)
   └──────────┘   └─────────────┘

   Storefront ─ 1..n ─▶ Space ─ 1..n ─▶ Post ─ 1..n ─▶ Reply
   Storefront ─ 1..n ─▶ Event ─ 0..1 ─▶ Replay
   Coach ─ 1..n ─▶ Reward ─ 1..n ─▶ RewardClaim ─▶ Client
   Coach ─ 1..n ─▶ CopilotDraft (review queue)
```

Each box becomes a Prisma model with concrete FKs, additively, in a
later runtime PR. None are added in this spec set.

### 5.3 The compliance line (kept tight)

A storefront / offer / listing / community post / replay description
/ AI copilot draft **may not**:

- Promise a return, a yield, a payoff, a savings-rate hit, or a
  net-worth bracket. ("$10k in 90 days" — banned.)
- Suggest the platform is an investment, a brokerage, a deposit
  account, or a yield-bearing wallet. ("Earn 5% on your goals" —
  banned.)
- Use a leaderboard or comparison tile that exposes a real money
  figure. (Bucketed rank only — already pinned by
  [`coach-led-programs/02-leaderboards.md`](../coach-led-programs/02-leaderboards.md)
  and re-pinned in [`05-marketplace-discovery.md`](./05-marketplace-discovery.md).)
- Use prize-draw, sweepstakes, or gambling shapes for rewards.
  ("Spin to win an extra $50 in your savings tracker" — banned.)
- Promise an FDIC-insured product, a tax outcome, a debt-elimination
  outcome, or a credit-score outcome. ("Wipe your credit card
  debt in 60 days" — banned.)
- Frame the AI copilot as a financial advisor or fiduciary.

Pinned by extending the existing
[`backend/test/ai-prompt-doctrine.spec.ts`](../../../backend/test/ai-prompt-doctrine.spec.ts)
and adding `backend/test/storefront-doctrine.spec.ts` and
`backend/test/marketplace-rank.spec.ts` in their respective runtime
PRs.

## 6. HOW (the runtime PR shape)

The runtime work this spec set authorises is **eleven** narrow PRs,
each independently revertable, each behind its own flag, each with
its own README. The proposed order:

1. **PR-FS-1** Storefront read-only (no transact). Schema + GET
   `/api/storefronts/:slug` + read-only mobile screen. Flag:
   `STOREFRONTS_READ_ENABLED`.
2. **PR-FS-2** Offers (catalogue only). Schema + GET / coach-write
   `/api/offers/*`. Flag: `OFFERS_ENABLED` (catalogue separate from
   billing).
3. **PR-FS-3** Billing wiring (Stripe or chosen processor). Order /
   subscription / refund schema. POST `/api/checkout/sessions`. Flag:
   `BILLING_ENABLED`. Hard gate: PR #120 lane #05.
4. **PR-FS-4** Applications. Application schema + state machine +
   inbox. Flag: `APPLICATIONS_ENABLED`. Hard gate: PR #122
   acceptance.
5. **PR-FS-5** Affiliates / referrals. AffiliateLink + attribution
   ledger + payout job. Flag: `AFFILIATES_ENABLED`.
6. **PR-FS-6** Marketplace discovery. Listing index + ranker + feed.
   Flag: `MARKETPLACE_ENABLED`.
7. **PR-FS-7** Community spaces. Space / Post / Reply schema +
   moderation queue. Flag: `SPACES_ENABLED`.
8. **PR-FS-8** Events / calls / replays. Event + Replay schema +
   reminder job + recording-consent UX. Flag: `EVENTS_ENABLED`.
9. **PR-FS-9** Rewards / bounties. Reward + RewardClaim + behavioural
   trigger evaluator. Flag: `REWARDS_ENABLED`.
10. **PR-FS-10** AI copilot for coaches. CopilotDraft + tool-calling
    server, review queue. Flag: `COPILOT_ENABLED`. Hard gate: PR
    #117 acceptance.
11. **PR-FS-11** Operator console for the above (moderation,
    refunds, flag panel, dashboard tiles). OWNER-only.

A twelfth PR — **PR-FS-12** — extends `mobile/DESIGN.md` and the
doctrine pin tests for the new surfaces.

Each PR is gated independently. None requires the others to ship
first except where noted (FS-3 gates FS-5 ↔ FS-9 transactional
features; FS-4 gates the L3 path; FS-6 needs FS-1+FS-2; FS-9 needs
existing EOD primitives; FS-10 needs PR #117 acceptance).

## 7. Architectural decisions taken in this PR

1. **One-stop-shop, not a parallel storefront.** The storefront,
   marketplace, community, events, and rewards surfaces are
   *first-class screens inside TGP: Finance*, not a separate web
   property. A coach who already has a Stan or Kajabi store can
   deeplink in; we do not export to one. Public web is out of
   scope; deeplink unfurls (OG meta) only.
2. **Catalogue separates from billing.** PR-FS-2 (offers as a
   catalogue) is mergeable before PR-FS-3 (billing). A coach can
   build their offer set with all copy, screen flow, and
   application gates in place, then a single billing PR turns
   transactions on. This avoids one mega-PR and makes the billing
   PR review-bounded.
3. **Money never appears in a public surface.** Inherited from
   PR #106. Storefront badges show "300+ clients", not "$300k
   revenue". Marketplace ranks show editorial buckets, not raw
   counts. Rewards show "savings goal hit", not "$2,300 in cash".
4. **Rewards are behavioural, not financial.** A reward fires on
   *EOD-derived* behavioural state — a savings-deposit streak, a
   debt-bracket cross, a spending-streak length — never on a yield
   or a money-flow event. This keeps the surface out of any
   investment-product or sweepstakes regime. (Detailed in
   [`08-rewards-bounties.md`](./08-rewards-bounties.md) §1.)
5. **AI copilot has two models, two doctrines.** The coach-business
   copilot drafts replies, recaps, listing copy, intake summaries —
   it operates on a coach's own data and produces drafts a human
   reviews before sending. The client-side AI coach is unchanged
   (read-only finance education, voice-pinned). Neither replaces a
   licensed advisor; both carry the disclaimer in copy.
6. **Doctrine pins extend, do not branch on flags.** The
   bone/ink/oxblood palette, no-emoji rule, no-confetti rule, and
   no-audience-framing rule apply to every new screen and every AI
   draft. A flag may hide a feature; it may not relax a doctrine.
7. **Public coach profiles remain off.** Storefronts are in-app.
   Public unfurl is OG-meta only. The fitness side (PR #121 spec
   #27) gets public profiles first; finance follows only after
   compliance sign-off and only behind a separate flag.
8. **Cross-coach client transfer remains off.** Out of scope, same
   as PR #106.

## 8. Disclaimers (verbatim, where they ship)

These strings ship as constants in
`backend/src/compliance/disclaimers.ts` (added in PR-FS-1) and the
mobile renders them verbatim through a single
`<DisclaimerBlock kind={...}/>` component (added in PR-FS-12).

> **education_only** (footer of every storefront, marketplace card,
> community space, event surface, reward surface, copilot draft):
>
> "This app provides financial education and tracking tools for
> informational purposes only. Nothing in this app constitutes
> financial, tax, or investment advice. Consult a licensed financial
> professional before making financial decisions."

> **no_outcome_promise** (under every offer title, every reward
> card, every marketplace listing):
>
> "Outcomes vary. The Growth Project does not guarantee a financial
> result, return, or change to your accounts."

> **purchase_terms** (above every Buy / Subscribe / Pay deposit
> button):
>
> "By continuing, you authorise the displayed charge and accept the
> refund and dispute terms. Coach-led content is delivered by the
> coach, not by The Growth Project. Subscriptions renew automatically
> until cancelled."

> **rewards_no_prize** (on every reward card and reward claim
> screen):
>
> "Rewards recognise behaviour you complete using the app. They are
> not investment returns, prizes, or gambling outcomes. Where the
> reward has a cash value, your coach (or The Growth Project) funds
> it directly; tax treatment is your responsibility."

> **ai_copilot_to_coach** (header of every AI copilot draft surface
> shown to a coach):
>
> "Drafts only. Review before sending. The Growth Project's AI does
> not give financial advice and is not a fiduciary."

> **ai_client_coach** (header of the existing client-side AI coach,
> already shipped — re-pinned for completeness):
>
> "Educational responses only. Not financial advice."

The disclaimer copy is **the canonical merge gate** for the
compliance reviewer. Changing any of these strings in a runtime PR
re-triggers compliance review.

## 9. Privacy & security posture

- **Money is private.** No raw balance, transaction line, account
  identifier, or institution name leaves the user's tenant via any
  storefront, marketplace, community, replay, reward, or copilot
  draft surface. Pinned by extending the existing
  [`backend/test/system-trust-meta.spec.ts`](../../../backend/test/system-trust-meta.spec.ts)
  with new "no money in public" capability rows.
- **Tenant boundary preserved.** Per
  [`backend/docs/TENANCY.md`](../../../backend/docs/TENANCY.md),
  every storefront / offer / order / application / affiliate /
  space / event / reward / copilot row carries a `coach_id` and a
  `client_id` (or only one), and every read query filters on the
  caller's tenant first.
- **PCI scope minimised.** Card data never touches our servers;
  Stripe Checkout (or the chosen processor) is the only entry
  point. Webhooks are signature-verified.
- **Storage.** Avatars, content media, replay video, and offer
  artwork all live in Supabase Storage with signed URLs. Same
  posture as PR #106 §3.
- **GDPR scrub.** Every new model includes a `client_id` and is
  enumerated in `backend/src/gdpr/scrub.service.ts` (extended by
  each runtime PR; pinned by `test/gdpr-scrub.spec.ts`).
- **Audit log.** Every coach action that is visible to a client
  (publishing a storefront, posting in a space, scheduling an
  event, funding a reward, sending an AI-copilot draft) writes a
  row to `audit_log`.
- **Privacy budget on discovery.** Marketplace ranking inputs are
  bucketed (size buckets, recency buckets), never raw. See
  [`05-marketplace-discovery.md`](./05-marketplace-discovery.md) §6.

## 10. Abuse & moderation

A separate moderation queue, owned by OWNER + compliance reviewer,
spans all surfaces:

- Storefront copy + offer titles (pre-publish review for new coaches;
  spot-check after).
- Marketplace listings (always reviewed before they appear in a
  feed).
- Community posts (post-hoc moderation; report-flag flow).
- Replay descriptions (pre-publish for new coaches; spot-check
  after).
- Reward titles + descriptions (pre-publish, every time).
- AI copilot drafts that the outcome-filter blocked (queued for
  review).

Every queue item carries a kind, the offending text, the row id, the
coach id, the surface, the time, and the action history. The
runbook is in [`11-rollout-and-ops.md`](./11-rollout-and-ops.md) §6.

## 11. Feature flags & entitlements (summary)

Each surface ships behind a global × per-coach flag (the same shape
as PR #106 §5):

| Flag | Default | Notes |
|---|---|---|
| `STOREFRONTS_READ_ENABLED` | off | global gate. |
| `OFFERS_ENABLED` | off | catalogue only; no transactions. |
| `BILLING_ENABLED` | off | turns checkout on. |
| `APPLICATIONS_ENABLED` | off | gated programs. |
| `AFFILIATES_ENABLED` | off | per-coach gate via `coach_profiles.affiliates_enabled`. |
| `MARKETPLACE_ENABLED` | off | global gate; editorial off-switch wins. |
| `SPACES_ENABLED` | off | per-coach gate. |
| `EVENTS_ENABLED` | off | per-coach gate. |
| `REWARDS_ENABLED` | off | per-coach gate; coach-funded vs platform-funded sub-flag. |
| `COPILOT_ENABLED` | off | per-coach gate; `coach_premium`-only by default. |

Entitlements (L1 / L2 / L3 / `coach` / `coach_premium`) follow the
matrix in
[`coach-led-programs/08-entitlements.md`](../coach-led-programs/08-entitlements.md).
The capability table for the new surfaces is in [`02-offers-and-checkout.md`](./02-offers-and-checkout.md) §10.

## 12. Analytics (catalogue extract)

Detailed in [`11-rollout-and-ops.md`](./11-rollout-and-ops.md) §3.
A representative slice (PostHog `analytics.capture` is a no-op when
`POSTHOG_KEY` is unset, per existing posture):

- `storefront_view`, `offer_view`, `checkout_started`,
  `checkout_completed`, `checkout_abandoned`, `subscription_renewed`,
  `subscription_cancelled`, `refund_requested`, `refund_resolved`.
- `application_started`, `application_submitted`,
  `application_decided`, `deposit_paid`.
- `affiliate_link_clicked`, `referral_attributed`,
  `affiliate_payout_run`.
- `marketplace_feed_viewed`, `listing_clicked`,
  `editorial_override_applied`.
- `space_post_published`, `post_reported`, `mod_action_taken`.
- `event_scheduled`, `event_attended`, `replay_viewed`,
  `replay_caption_failed`.
- `reward_funded`, `reward_unlocked`, `reward_claimed`,
  `reward_expired`.
- `copilot_draft_created`, `copilot_draft_blocked_by_filter`,
  `copilot_draft_sent`.

## 13. Tests (catalogue extract)

Detailed per spec. Doctrine-level pins added in this set:

- `backend/test/storefront-doctrine.spec.ts` — outcome-claim filter
  on storefront and offer copy; verbatim disclaimers present.
- `backend/test/marketplace-rank.spec.ts` — money never appears as a
  ranking input or display; bucketed only.
- `backend/test/rewards-compliance.spec.ts` — reward kinds are an
  allow-list; no yield, no prize-draw, no gamble shape.
- `backend/test/copilot-doctrine.spec.ts` — copilot drafts pass the
  outcome filter; voice rules match `mobile/DESIGN.md` §5.
- `mobile/test/design-doctrine.spec.ts` — extended for the new
  screens (palette, no emoji, no confetti).

## 14. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| A coach posts an outcome-promise in a storefront title | high | regulatory + brand | Outcome-claim filter on every coach-written field at write time + queue for review; default to "Education only" suffix when filter trips. |
| Money figure leaks into a public surface | medium | regulatory + privacy | Doctrine-pin tests; marketplace ranker uses bucketed inputs only; community + space scrubbers strip any token matching `\$\d` or "balance:" or known-account patterns. |
| Reward looks like a sweepstakes | low | regulatory | Reward shape is an allow-list of behavioural triggers; UI never uses "win" / "prize" / "lucky"; coach-funded vs platform-funded distinction is verbatim in copy. |
| Affiliate program gets gamed by sock-puppets | medium | financial | Attribution requires a real check-in within 14 days of signup; payout-floor + chargeback-clawback rules; rate-limit on affiliate signup; OWNER review on first payout. |
| AI copilot drafts an advice statement | medium | regulatory | Outcome filter on every draft; no draft ever auto-sends; coach review required; doctrine pin. |
| Application deposit refund disputed | medium | financial + brand | Verbatim refund-policy disclosures; deposit refundable until application is decided; receipt copy makes terms clear. |
| Public deeplink leaks PII via OG image | low | privacy | OG image is a constant per coach (their own avatar) plus the canonical `education_only` disclaimer line, never per-client data. |
| Marketplace becomes a pump-and-dump for one coach | low | brand | Editorial override; per-coach surface budget; offset rules in ranker; OWNER kill-switch on listing. |

## 15. Dependencies

- This spec set depends on **no other spec set merging first**.
- The runtime PRs depend on:
  - PR #120 lane #01 (feature flags & entitlements) — for the
    central flag service.
  - PR #120 lane #05 (billing packaging) — for the billing PR.
  - PR #120 lane #04 (data lifecycle) — for the GDPR scrub
    extension.
  - PR #120 lane #07 (migration safety) — for additive Prisma
    migrations under load.
  - PR #122 (masterminds operating model) — for the application
    state machine and L3 cohort surface.
  - PR #117 (AI Program Builder) — for the prompt template + draft
    surface that the coach copilot reuses.
  - PR #123 (coach-experience wave) — for shared challenge,
    leaderboard, content-board, and entitlement primitives.

## 16. Acceptance criteria (for this spec PR)

- [ ] No file outside `docs/specs/storefront-marketplace/` is
      modified by this PR.
- [ ] No runtime code, schema, env var, CI file, or `new-website/`
      change is part of this PR.
- [ ] Every spec from `01-` through `11-` answers WHY / WHEN /
      WHERE / WHO / WHAT / HOW.
- [ ] Every spec includes screens & navigation, disclaimers,
      privacy/security, abuse/moderation, flags/entitlements,
      analytics, rollout, tests, risks, dependencies, acceptance
      criteria, operator handoff.
- [ ] [`10-gap-map.md`](./10-gap-map.md) names every row of PR #106
      and every fitness draft PR #117–#123 against this set.
- [ ] Compliance reviewer signs off on the disclaimer copy in §8 of
      this overview before this PR is taken out of draft.
