# TGP: Finance — Storefront & Marketplace spec set

**Status:** draft, documentation-only. No runtime code, schema, env vars,
CI, or `new-website/` touched. The runtime work this spec set
authorises lands in narrow, gated PRs that follow.

This is the finance app's contribution to the broader TGP "one-stop
shop for coaches" — the product surface that lets a finance coach run
their business inside the app: storefront, offers, checkout, deposits,
subscriptions, applications, affiliates, community, events,
goal-based rewards, and an AI business copilot. It is the **Whop-shape**
applied to consumer finance, with the consumer-finance compliance
boundary held tight.

This set is **distinct from but layered on top of** the existing draft
[`docs/specs/coach-led-programs/`](../coach-led-programs/) (PR #106 in
this repo). Coach-led programs covers the *delivery* primitives —
challenges, regimens, content boards, leaderboards, messaging,
entitlements, compliance. **This** set covers the *commerce, discovery,
community, events, rewards, and AI-business* layer that wraps those
primitives so a coach can actually sell, scale, and operate a business
on top of them.

## Read order

| # | Spec | One-liner |
|---|------|-----------|
| [00](./00-overview.md) | Overview | Why this set exists, the WHY/WHEN/WHERE/WHO/WHAT/HOW frame, the one-stop-shop architecture, the consumer-finance line, the L1/L2/L3 entitlements summary, the doctrine constraints, and out-of-scope. |
| [01](./01-storefronts.md) | Coach storefronts | Coach-owned, in-app storefront surface: bio, offer grid, social proof, disclaimers, deeplinks, slugs, moderation. |
| [02](./02-offers-and-checkout.md) | Offers, checkout, deposits, subscriptions | The offer object, one-time / deposit-then-balance / subscription / payment-plan flows, checkout UX, compliant copy, refund states, dunning. |
| [03](./03-applications.md) | Applications | Gated programs (mastermind / cohort / 1:1) with application forms, screening, deposit-on-approval, KYC-lite, decision SLAs. |
| [04](./04-affiliates-referrals.md) | Affiliates & referrals | Coach-controlled affiliates and client-side referrals, attribution, payout policy, FTC disclosure, abuse controls. |
| [05](./05-marketplace-discovery.md) | Marketplace discovery | In-app discovery feed: ranked, category-scoped, balance-redacted, with editorial overrides and a hard ban on outcome claims. |
| [06](./06-community-spaces.md) | Community spaces | Per-coach and per-program community spaces (threads, replies, pinned posts), moderation queue, scrubbing, and the no-money-in-public rule. |
| [07](./07-events-calls-replays.md) | Events, calls, replays | Live coaching calls, AMAs, cohort sessions: scheduling, attendance, reminders, recording consent, replay library, captioning. |
| [08](./08-rewards-bounties.md) | Rewards & bounties | Goal-locked rewards for savings / debt-payoff / spending-streak — coach-funded or platform-funded, with explicit no-yield, no-prize-promotion, no-gambling guardrails. |
| [09](./09-ai-copilot.md) | AI business / copilot finance boundaries | Coach-business AI (drafting, recap, replies) and the existing client-side AI coach: what each may and may not say, and the compliance pin. |
| [10](./10-gap-map.md) | Gap map vs PR #106 + backend #117–#123 | Row-by-row "do we already have this?" against the existing finance and fitness drafts, with closest existing artefact and the runtime delta. |
| [11](./11-rollout-and-ops.md) | Rollout, flags, analytics, ops | Feature flags × per-coach gates, analytics catalogue, healthy-signal table, kill switches, capacity, operator handoff. |

## Required sections (per downstream spec)

Every spec from `01-` onward answers, in order:

1. **WHY** — problem in user/business terms, with the one-line claim.
2. **WHEN** — gating conditions (schema, flag, billing, compliance).
3. **WHERE** — the surfaces, files, and modules a runtime PR will touch.
4. **WHO** — the user roles involved, the operator on the hook, the
   reviewers required.
5. **WHAT** — what already exists, what is missing, the proposed
   shape (data sketch, screens).
6. **HOW** — UX flow, API sketch, contracts, examples, and the
   runtime PR shape that follows.

Plus, in every spec:

- Screens & navigation (textual storyboard).
- Consumer-finance disclaimers (verbatim copy where it ships).
- Privacy & security posture (what is shown to whom, what is
  redacted, retention).
- Abuse & moderation (what can go wrong, what catches it).
- Feature flags & entitlements (global × per-coach × tier).
- Analytics events (`event_name`, properties, where fired).
- Rollout (Stage 0 → GA, kill switch).
- Tests (unit, integration, doctrine-pin, e2e where needed).
- Risks & mitigations.
- Dependencies (other specs, backend PRs, fitness PRs).
- Acceptance criteria (binary, observable).
- Operator handoff (runbook entries, dashboards, alerts).

## Architectural decisions taken in this PR

Documented at length in [`00-overview.md`](./00-overview.md). The
short list:

1. **Money never appears in a public surface.** Storefronts,
   marketplace, communities, leaderboards, replays, and rewards all
   inherit the no-money-in-public rule from `mobile/DESIGN.md` and
   the existing `coach-led-programs` set.
2. **No outcome guarantees, ever.** The compliance filter from
   [`coach-led-programs/09-compliance.md`](../coach-led-programs/09-compliance.md)
   extends to storefront copy, offer titles, marketing surfaces,
   community posts, replay descriptions, and AI-drafted output.
3. **Payments are out of scope for v1 runtime.** The spec set
   defines the offer object, the checkout UX, the compliant copy,
   and the receipt surface, but the actual processor wiring (Stripe
   or otherwise) lands in a separate, narrow runtime PR after the
   spec set merges. The spec is processor-agnostic where possible.
4. **Entitlements model is shared with the existing set.** L1 / L2 /
   L3 client tiers and `coach` / `coach_premium` coach tiers extend
   exactly as in [`coach-led-programs/08-entitlements.md`](../coach-led-programs/08-entitlements.md).
   Storefront, applications, and rewards add new *capabilities* to
   the same matrix; they do not introduce a new tier axis.
5. **Public web profiles remain out of scope.** Coach storefronts in
   v1 are in-app only. A deeplink `/c/{slug}` resolves inside the app
   (`expo-linking`), and a public *unfurl* page (OG meta only, no
   transactional surface) is the most a future PR will add. The
   existing rule from PR #106 stands.
6. **Doctrine pins extend, do not branch on flags.** No emoji, no
   confetti, no audience framing, bone/ink/oxblood palette, Cormorant
   Garamond + Inter — applies whether the storefront flag is on or
   off. Pinned by extending `mobile/test/design-doctrine.spec.ts`
   and `backend/test/ai-prompt-doctrine.spec.ts`.

## What this PR is NOT

- It is **not** a runtime PR. No controllers, services, modules,
  migrations, env vars, CI files, mobile features, or doctrine pins
  are added or modified.
- It is **not** a rewrite of the existing
  [`coach-led-programs/`](../coach-led-programs/) set. That set
  defines delivery primitives (challenges, regimens, content,
  leaderboards). This set defines commerce, discovery, community,
  events, rewards, and the AI-business layer. They compose; they do
  not overlap. Where they almost overlap (rewards on top of
  challenges; storefronts on top of programs), the gap map in
  [`10-gap-map.md`](./10-gap-map.md) names the exact seam.
- It is **not** the fitness side. Cross-references to fitness draft
  PRs #117–#123 are for compatibility — the finance app must not
  silently diverge on shared concerns (entitlements, flags,
  compliance) — but every fitness primitive that lands here is
  re-evaluated against the finance compliance line first.
- It is **not** a `new-website/` PR. No directory of that name
  exists in this repo (verified via `find . -name new-website` →
  empty). Public marketing surfaces are explicitly out of scope.

## Cross-references (frozen at draft time)

- This repo:
  - Existing draft PR [#106](https://github.com/BradleyGleavePortfolio/tgp-finance-app/pull/106) — `docs/specs/coach-led-programs/` (delivery primitives).
  - `mobile/DESIGN.md` — quiet-luxury doctrine.
  - `backend/docs/MONEY.md` — Decimal money handling.
  - `backend/docs/TENANCY.md` — coach scoping rules.
  - `README.md` §"What is in the app" — current finance surface.
- Fitness backend (`BradleyGleavePortfolio/growth-project-backend`):
  - Draft PR #117 — AI Program Builder RFC.
  - Draft PR #118 — Team Mode foundation ADR.
  - Draft PR #119 — Expansion roadmap + handoff briefs (rows #01–#02).
  - Draft PR #120 — Platform-readiness consolidated lanes.
  - Draft PR #121 — Backend-owned pre-work (rows #21–#29: outcome
    check-ins, at-risk detector, weekly recap, AI voice, ready-to-
    scale checklist, intake questionnaire, public coach profile,
    program templates, revenue dashboard).
  - Draft PR #122 — Masterminds operating-model spec (L2/L3 tiers,
    application funnel, IRL events).
  - Draft PR #123 — Coach-experience expansion wave (rows #30–#37,
    incl. challenges, leaderboards, content boards, regimens,
    messaging, L2/L3 entitlements, branded instances).

The gap map at [`10-gap-map.md`](./10-gap-map.md) walks each row of
PR #106 and PR #117–#123 against this spec set and names what is new,
what is reused, and what is intentionally out of scope.
