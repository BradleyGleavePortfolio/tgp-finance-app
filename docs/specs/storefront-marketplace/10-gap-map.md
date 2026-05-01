# 10 — Gap map: this spec set vs PR #106 and backend PRs #117–#123

> **Status:** draft, documentation-only.

## 1. WHY this gap map exists

The TGP product has parallel work in two repos:

- **This repo (`tgp-finance-app`)**: existing draft PR #106
  (`docs/specs/coach-led-programs/`) defines the **delivery
  primitives** for finance coaches — challenges, leaderboards,
  profile avatars, content boards, regimens, assignments,
  messaging+progress, entitlements, compliance, rollout.
- **Fitness backend (`growth-project-backend`)**: draft PRs #117
  (AI Program Builder), #118 (Team Mode), #119 (expansion roadmap +
  briefs #01–#02), #120 (platform-readiness lanes), #121
  (rows #21–#29), #122 (masterminds), #123 (rows #30–#37,
  coach-experience wave).

Without a gap map, this storefront-marketplace set duplicates work,
contradicts decisions, or silently diverges on shared concerns.
This document walks each row of those nine PRs and names: **do we
already have it? if so where? what is the runtime delta this set
adds?** It also calls out what is **deliberately out of scope** for
this set and where the seam sits.

## 2. Format

Each row carries:

- **Where it lives** — which PR / file currently covers it.
- **Status here** — `reused`, `extended`, `complementary`,
  `out of scope`.
- **Delta** — what *this* spec set adds (if anything) that the
  existing artefact does not.
- **Risk if not aligned** — a one-liner.

## 3. PR #106 — `docs/specs/coach-led-programs/` (this repo)

PR #106 is the **delivery** layer. This set is the **commerce +
discovery + community + events + rewards + AI-business** layer that
sits on top of it. The seam is mostly clean; the few overlaps are
named below.

| PR #106 row | Where | Status here | Delta | Risk |
|---|---|---|---|---|
| `00-overview.md` | the overview | **reused** | This set's [`00-overview.md`](./00-overview.md) §1 cross-links to PR #106 §1 (why finance is not a port of fitness). The compliance argument is shared. | If PR #106 changes its compliance framing, this set's overview should re-baseline. |
| `01-challenges.md` (coach-created savings / spending-streak / debt-payoff challenges) | PR #106 | **complementary** | `08-rewards-bounties.md` of this set adds **goal-locked rewards** that fire on the same EOD-derived state PR #106 challenges use. Rewards are an output layer; challenges are a tracking layer. They share the trigger evaluator pattern (pure functions over EOD state) but live in different modules (`challenges/` vs `rewards/`). | Naming collision risk — `challenge_complete` and `reward_unlocked` are distinct events; rewards do **not** auto-fire on challenge completion unless a reward's `trigger` is bound to that challenge's primitive. |
| `02-leaderboards.md` (opt-in, balance-redacted, coach-scoped) | PR #106 | **reused** | Marketplace ([`05-marketplace-discovery.md`](./05-marketplace-discovery.md)) re-pins the no-money rule the leaderboards already established, extending it from leaderboards to rank inputs and card display. | Leaderboards and marketplace must use the **same** bucketing primitives (`backend/src/insights/bands.ts`) to avoid two truths. |
| `03-profile-avatars.md` (JPEG, 512×512, EXIF-stripped, public-read) | PR #106 | **reused** | Storefronts ([`01-storefronts.md`](./01-storefronts.md) §5.1) reuse the same pipeline for avatar + cover image. No new pipeline. | If PR #106 changes the storage bucket / signed-URL TTL, storefronts inherit. |
| `04-content-boards.md` (PDF / newsletter / video / link, sanitised HTML, allowlisted URLs) | PR #106 | **reused** | Offers ([`02-offers-and-checkout.md`](./02-offers-and-checkout.md) §5.1) carry a `content_pass` kind that gates a content board. The board itself, the renderer, the URL allow-list — all PR #106. | Content-pass offer kind must reference an existing content board; the runtime PR-FS-2 will carry an FK constraint. |
| `05-regimens.md` (multi-phase finance programs; `Program + Phase + Assignment`) | PR #106 | **reused / complementary** | Offers carry `application_gated`, `payment_plan`, and `one_time_program` kinds; each can wire to a regimen. Applications ([`03-applications.md`](./03-applications.md)) drive into a regimen on `CONFIRMED`. The regimen object is PR #106's; this set adds the *commerce path into it*. | Application's `cohort_id` must resolve to a `Program` row from PR #106. |
| `06-assignments.md` (assignment contract across challenges / content / regimens) | PR #106 | **reused** | Rewards' `RewardClaim` is **not** an assignment. Different shape, different lifecycle. Documented to avoid future confusion. | None. |
| `07-messaging-progress.md` (subject threads, structured progress payloads) | PR #106 | **reused / complementary** | Community spaces ([`06-community-spaces.md`](./06-community-spaces.md)) are a **separate** surface from messaging — group / pinned / threaded vs 1:1. The AI copilot ([`09-ai-copilot.md`](./09-ai-copilot.md)) drafts both reply (1:1) and post (community). | The `reply` surface in copilot must call PR #106 §7's reply controller, not a duplicate. |
| `08-entitlements.md` (L1 / L2 / L3 + `coach` / `coach_premium`) | PR #106 | **extended** | This set adds **capability rows** to the same matrix (storefront edit, offer create, marketplace submit, application screen, copilot trigger, etc.) without introducing a new tier axis. | If PR #106 §8 changes tier definitions, this set's capability rows re-baseline. |
| `09-compliance.md` (disclaimer rendering, URL allow-list, outcome-guarantee filter, moderation queue) | PR #106 | **reused / extended** | This set re-uses the outcome-claim filter, extends the moderation queue to span 9 surfaces (storefront / offers / applications / community posts / replays / reward titles / copilot drafts / marketplace submissions / share cards), adds disclaimer constants (`purchase_terms`, `rewards_no_prize`, `ai_copilot_to_coach`). | The filter is shared code; if PR #106 lands first, this set extends it. If they land in opposite order, this set's runtime PR-FS-1 carries the filter and PR #106 imports. |
| `10-rollout-and-ops.md` (feature flags, analytics events, healthy-signal table, kill-switch playbook, capacity, operator handoff) | PR #106 | **extended** | This set's [`11-rollout-and-ops.md`](./11-rollout-and-ops.md) extends every section with the new surfaces' flags, events, signals, and runbooks. The shape is identical so an operator can read both back-to-back. | If PR #106 ships first, this set's rollout doc is purely additive. |

**Net of PR #106**: this set introduces **no overlap** with PR #106
delivery primitives. It introduces:

- New objects: `Storefront`, `Offer`, `Order`, `Subscription`,
  `Application`, `AffiliateLink`, `MarketplaceListing`, `Space`,
  `Event`, `Replay`, `Reward`, `CopilotDraft`.
- New surfaces: storefront, offers, checkout, applications,
  affiliates, marketplace, community, events, rewards, copilot.
- New flags: `STOREFRONTS_*`, `OFFERS_*`, `BILLING_*`,
  `APPLICATIONS_*`, `AFFILIATES_*`, `MARKETPLACE_*`, `SPACES_*`,
  `EVENTS_*`, `REWARDS_*`, `COPILOT_*`.

## 4. Fitness backend PR #117 — AI Program Builder RFC

| Concern | PR #117 | Status here | Delta |
|---|---|---|---|
| Coach asset ingestion (PDF / video / sheets / notes) | RFC §architecture | **reused** | This set's [`09-ai-copilot.md`](./09-ai-copilot.md) does **not** re-introduce ingestion. It uses the *same* prompt-template / draft / publication pattern §X of PR #117. |
| `ProgramDraft` / `ProgramDraftSection` / `ProgramPublication` | PR #117 | **reused** | This set's `CopilotDraft` is a **lightweight cousin** for *non-program* surfaces (replies, posts, listing copy, recaps, intake notes). The two coexist. |
| Tool-using assistant pattern | PR #117 | **reused** | Copilot's closed tool list (§5.3) is the same pattern, scoped tighter. |
| Provider-pluggable interface | PR #117 | **reused** | Copilot inherits the interface; default provider is Perplexity (the existing client AI coach provider) for short surfaces; long surfaces (`intake_summary`, `weekly_recap`) can opt to Anthropic per PR #117. |
| Cost controls | PR #117 §13 | **reused** | Copilot per-coach monthly token cap is a knob on the same interface. |
| Voice / doctrine pin | PR #117 §QA | **extended** | Copilot doctrine extends `ai-prompt-doctrine.spec.ts` with copilot-specific pins (no advice; no fiduciary; no balance leak). |
| Eval baselines | PR #117 §evaluation | **reused** | Copilot prompt templates carry their own fixtures alongside PR #117's. |

**Risk**: if PR #117 is rejected or substantially changed, the
copilot's tool / draft pattern needs re-baselining. Mitigated by
the spec's "PR #117 acceptance" hard gate.

## 5. Fitness backend PR #118 — Team Mode foundation ADR

| Concern | PR #118 | Status here | Delta |
|---|---|---|---|
| `Team` / `TeamMembership` / `ClientAssignment` | PR #118 | **complementary, optional** | Storefronts in v1 are per-coach. A team's storefront is a future PR — it would surface a single `Storefront` row whose `coach_id` is the team-owner coach, with team members listed in a "Team" trust strip. **Not in this spec set's runtime PRs.** |
| Permission matrix | PR #118 | **reused** | If/when team-mode lands, the OWNER queue + coach moderation power for storefronts/offers respects team permissions. |
| `acted_by_member_user_id` (per-staff attribution) | PR #118 | **complementary** | Audit log rows in this set carry an `actor_user_id`; once team-mode lands and `acted_by_member_user_id` exists, audit rows can carry both. |
| `TEAM_MODE_ENABLED` flag | PR #118 | **reused** | This set's flags are sibling; Team Mode does not gate any surface here. |

**Risk**: low. This set is team-agnostic in v1.

## 6. Fitness backend PR #119 — Expansion roadmap + handoff briefs (rows #01–#02)

| Concern | PR #119 | Status here | Delta |
|---|---|---|---|
| Roadmap row numbering | PR #119 | **complementary** | This set's runtime PRs are **not** in the roadmap (the roadmap is fitness-side). A future "finance expansion roadmap" doc may number these PR-FS-1 .. PR-FS-12. |
| Handoff brief shape (WHY / WHEN / WHERE / WHO / WHAT / HOW) | PR #119 | **reused** | This set's specs follow the same shape; an operator reading both reads the same structure. |
| `docs/architecture/handoff/` directory | PR #119 | **complementary** | This set lives under `docs/specs/storefront-marketplace/`. A future operator-facing handoff directory at `docs/architecture/handoff/` is a follow-up. |

**Risk**: low. Stylistic alignment.

## 7. Fitness backend PR #120 — Platform-readiness consolidated lanes

This is the **shared platform** PR. Every runtime PR in this spec
set must respect the lane that gates it.

| Lane | PR #120 brief | Status here | Delta |
|---|---|---|---|
| #01 Feature flags & entitlements | flags brief | **hard dependency** | Every runtime PR uses the central flag service from PR #120 #01. |
| #02 API versioning & contracts | versioning brief | **reused** | This set's API surfaces follow the versioning convention pinned in #02. |
| #03 Security, RBAC, & tenant boundaries | security brief | **hard dependency** | Storefront / offer / order / community / event / reward / copilot all carry a `coach_id` and a `client_id` (or one of them). |
| #04 Data lifecycle | scrub brief | **hard dependency** | Every new model is enumerated in `gdpr/scrub.service.ts` (extended per runtime PR). |
| #05 Billing packaging | billing brief | **hard dependency for PR-FS-3** | Stripe Connect / Tax / payouts decisions live here. |
| #06 Observability | observability brief | **reused** | Every runtime PR adds PostHog events + Sentry breadcrumbs. |
| #07 Migration safety | migration brief | **hard dependency** | Every Prisma migration in this set is additive; no drops. |
| #08 AI governance | AI brief | **hard dependency for PR-FS-10** | Copilot follows the AI governance posture. |
| #09 Support | support brief | **reused** | Every surface adds runbook entries. |
| #10 Analytics | analytics brief | **reused** | Every surface lists its events. |
| #11 Release QA | QA brief | **reused** | Doctrine pins extend the existing QA gate. |

**Risk**: high if PR #120 lanes drift. Mitigated by the explicit
hard-dependency callouts on each runtime PR.

## 8. Fitness backend PR #121 — Backend-owned pre-work (rows #21–#29)

These are fitness-side rows that have shape-relevant analogues in
finance.

| PR #121 row | Spec | Status here | Delta |
|---|---|---|---|
| #21 Outcome check-ins | `outcome-check-ins.md` | **complementary** | Finance equivalent is the existing EOD pipeline. **Not duplicated.** Where applicable (e.g., copilot's `weekly_recap`), the recap can read EOD-derived bands. |
| #22 At-risk rules engine | `at-risk-detector.md` | **complementary** | Finance has the existing red-flags dashboard. The marketplace ranker uses `coach_health_bucket` derived from the at-risk signal once it's available. |
| #23 AI weekly recap endpoint | `weekly-recap.md` | **reused / extended** | Copilot's `weekly_recap` surface is the *coach-facing* draft; the *client-facing* recap (per PR #121 #23) is a separate flow on the client side. The two share the recap-template family. |
| #24 Coach AI voice / tone setting | `coach-ai-voice.md` | **reused** | Copilot reads the voice setting via the `getCoachVoiceProfile` tool. |
| #25 Ready-to-scale checklist | `ready-to-scale-checklist.md` | **complementary** | A coach's storefront-publish CTA can surface a "complete ready-to-scale checklist?" prompt as a follow-up PR. **Not in this set's runtime PRs.** |
| #26 Intake questionnaire templates | `intake-questionnaire.md` | **reused** | Applications ([`03-applications.md`](./03-applications.md)) are an **application** flow distinct from intake; coaches who use both see them as separate surfaces. Intake feeds onboarding; application feeds offer admission. |
| #27 Public coach profile | `public-coach-profile.md` | **complementary, deferred** | Finance v1 is in-app only. A finance public-profile PR follows fitness only after compliance sign-off and only behind a separate flag. |
| #28 Program-template models | `program-templates.md` | **reused** | PR #106's regimen / `ProgramTemplate` is the finance equivalent; this set's offers point to those templates. |
| #29 Revenue dashboard aggregation | `revenue-dashboard.md` | **reused / extended** | Coach-side revenue tile shows order counts and bands (no raw money in the discovery / public surface; coach's own dashboard does show their own revenue per existing posture). The aggregator from PR #121 #29 is the same. |

**Risk**: medium if the recap / voice / intake templates change
shape; mitigated by the tool-layer indirection (copilot reads via
tools, not direct table joins).

## 9. Fitness backend PR #122 — Masterminds operating-model spec

| Concern | PR #122 | Status here | Delta |
|---|---|---|---|
| L1 / L2 / L3 tier model | PR #122 §2 | **reused** | Same definitions; this set's entitlement matrix uses them. |
| Application state machine (`INTERESTED → APPLIED → SCREENED → APPROVED → DEPOSIT_PAID → CONFIRMED`) | PR #122 §3 | **reused** | This set's [`03-applications.md`](./03-applications.md) §5.1 extends with `APPROVED_LAPSED`, `REFUNDED`, `WITHDRAWN`, `REJECTED`. |
| IRL event lifecycle | PR #122 §4 | **reused** | This set's [`07-events-calls-replays.md`](./07-events-calls-replays.md) supports `irl` event kind. |
| Event payment object | PR #122 §5 | **reused** | This set's `event_ticket` offer kind covers it. |
| Cohort space (community) | PR #122 §5 | **reused** | This set's `program_scope` and `offer_scope` Space cover it. |
| Branded-instance request | PR #122 §9 | **complementary, deferred** | Out of scope for v1. |
| Hiring / marketing trackers | PR #122 §5 | **out of scope** | Coach-internal tools; not a client-facing surface. |
| Roster export | PR #122 §5 | **complementary, deferred** | A future coach-side export endpoint; **not in this set's runtime PRs**. |

**Risk**: medium if the mastermind state machine adds states. Mitigated
by the closed enum + audit-row design.

## 10. Fitness backend PR #123 — Coach-experience expansion wave (rows #30–#37)

These are direct analogues to PR #106 in this repo. The gap-map row
in PR #123 lists "do we have this already?" against PR #117–#121;
the table below is the *finance-side* equivalent.

| PR #123 row | Already in finance? | Closest existing artefact |
|---|---|---|
| #30 Coach-created challenges | **yes** | PR #106 §`01-challenges.md`. |
| #31 Public/private leaderboards | **yes** | PR #106 §`02-leaderboards.md`. |
| #32 Profile pictures / avatars | **yes** | PR #106 §`03-profile-avatars.md`; reused by this set's storefront. |
| #33 Content boards | **yes** | PR #106 §`04-content-boards.md`. |
| #34 Coach-created regimens / programs | **yes** | PR #106 §`05-regimens.md`. |
| #35 Per-client regimen assignment | **yes** | PR #106 §`06-assignments.md`. |
| #36 Coach ↔ client messaging + progress visibility | **yes** | PR #106 §`07-messaging-progress.md`. |
| #37 L2 / L3 tiering, entitlements, branded instance | **partial** | PR #106 §`08-entitlements.md` covers L1/L2/L3 + `coach`/`coach_premium`; this set extends with capability rows for storefront / offer / marketplace / etc. **Branded instance is deferred** in both repos. |

**Net**: rows #30–#37 are covered finance-side by PR #106 + this
set. Row #37 (branded instance) remains deferred in both.

## 11. Out-of-scope cross-repo concerns

The following are explicitly **not** in this set or in PR #106 and
are also not gated by anything here:

- **Public web marketplace.** Out of scope. `new-website/` is
  untouched.
- **Public web coach profile.** Deferred (finance-side compliance
  gate).
- **Cross-coach client transfer.** Out of scope.
- **Native chat beyond thread + subject extension.** Out of scope.
- **OCR scrubber on community image attachments.** Follow-up PR.
- **Stripe Tax / 1099 issuance.** Follow-up PR (PR #120 lane #05
  decides shape).
- **Granular per-client reward targeting.** Out of scope; rewards
  are bucketed audiences only.
- **Live recording capture (Zoom/Meet webhooks).** Follow-up PR
  after PR-FS-8 manual upload ships.
- **Cross-app federation between fitness and finance for storefronts.**
  Out of scope; a coach who runs both verticals has one storefront
  per vertical in v1.

## 12. Crosswalk to PR #120 lanes

| Lane | This set's runtime PR(s) that depend on it |
|---|---|
| #01 Flags & entitlements | every PR-FS-* |
| #02 Versioning | every PR-FS-* |
| #03 RBAC | every PR-FS-*, especially OWNER queues |
| #04 Data lifecycle | every PR-FS-* (GDPR scrub extension) |
| #05 Billing | PR-FS-3, PR-FS-4 (deposit), PR-FS-5 (payouts), PR-FS-9 (redemption) |
| #06 Observability | every PR-FS-* (events + Sentry) |
| #07 Migration safety | every PR-FS-* (additive Prisma) |
| #08 AI governance | PR-FS-10 |
| #09 Support | every PR-FS-* (runbooks) |
| #10 Analytics | every PR-FS-* |
| #11 Release QA | every PR-FS-* (doctrine pins) |
