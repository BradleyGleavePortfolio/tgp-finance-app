# Coach-Led Finance Programs — Spec Overview

> **Status:** Draft / unmerged. No runtime code changes in this PR — these
> documents describe a future product surface and the architectural decisions
> that have to land before we ship it.
> **Audience:** Founders, product, eng leads, and the compliance reviewer who
> will sign off on the consumer-finance boundary work in §11.
> **Sibling app context:** The Growth Project: Fitness ships an analogous
> "coach expansion" suite (challenges, leaderboards, avatars, content boards,
> regimens, assignments, messaging). This document is the finance analogue.
> It deliberately does **not** copy the fitness implementation; finance has
> stricter consumer-risk constraints, a quieter editorial register, and a
> read-only money posture that the fitness app does not.

---

## 1. Why this work, and why now

### Why

The Growth Project: Finance today is a **single-coach, single-client**
product. A coach has a roster, a client has one coach, and the only shared
artefacts are coach notes, program templates (apply-once, no audit trail
beyond a note), and accountability pairing (two clients of the same coach
who share streaks but not balances).

That works for the founding cohort. It does not scale to the way coaches
actually run their practice:

- They run **cohorts** ("Q1 Debt Reset", "Sinking-Fund Cohort").
- They publish **regimens** ("90-day debt avalanche", "60-day cash floor
  rebuild") that span weeks and have phases.
- They share **content** — PDFs, newsletters, recorded sessions,
  spreadsheets — that they want to gate to enrolled clients.
- They run **structured challenges** (savings streaks, no-spend windows,
  debt-payoff sprints) where progress is observable and clients can opt
  into being seen by peers.
- They want a **public-facing identity** (avatar, bio, a small,
  non-anxiety-provoking leaderboard of consenting clients) that they can
  point a prospect at without exposing balances.

Finance is the keystone of the TGP coaching ecosystem because it is the
slowest, most durable behavioural change. Today the app cannot host the
ways a real coach already operates around it.

### Why now

Three forcing functions:

1. **Coach roster is past the point where 1:1 messaging covers it.** The
   `getStudents` endpoint already returns the full roster unpaginated
   (see `backend/src/coach/README.md` § Operations). Coaches with
   30+ clients are emailing PDFs out-of-band. We are losing the artefact.
2. **The federation surface to the fitness backend is live**
   (PR #102, #105). The unified admin console can already see cross-app
   coach summaries by email. Adding a parallel programs surface in
   finance lets the console answer "who is enrolled in what" across both
   products without inventing a new identity layer.
3. **The sale-readiness pass** (`chore/sale-readiness-truthfulness`)
   removed every false-capability claim from the Trust Center. We can
   now ship a leaderboard and a content board and have them be exactly
   what they say. The doctrine is in place; the product is what's
   missing.

### Why not just port the fitness implementation

Three reasons, in order of how badly they would bite us:

1. **Money is not reps.** A "no-spend Sunday" leaderboard that publishes
   a dollar figure is a privacy disaster. Fitness leaderboards rank
   numbers that mean nothing out of context (workouts/week). Finance
   numbers mean a great deal out of context, and our doctrine is that
   balances never leave the authenticated owner's screen.
2. **Editorial register.** The fitness app has confetti, badges, and
   green/red signal colour. Finance is bone, ink, oxblood, no emoji, no
   gamification (`mobile/DESIGN.md` §1, §2, §5). A streak chrome that
   ships in fitness will fail review here.
3. **Consumer-finance regulatory surface.** A coach who tells a client
   "complete the high-yield savings challenge" is, in some
   jurisdictions, edging toward investment-advice territory if the
   "challenge" prescribes a specific product. Fitness can recommend a
   workout. Finance can recommend a behaviour but has to be careful
   about prescribing a product or an outcome. §11 is the policy work.

---

## 2. Scope of this spec set

This spec set is a **stack of design documents**, not a single epic. Each
document is independently shippable in the sense that an eng lead can
read it, decide whether the trade-offs are acceptable, and pick it up
without reading the others. Where one document depends on another, the
dependency is called out explicitly in the **Dependencies** section.

| # | Document | One-line summary |
|---|----------|------------------|
| 00 | **overview** (this file) | Why, when, where, who, what, how — and the L2/L3 entitlement model the rest of the docs assume. |
| 01 | [`challenges.md`](./01-challenges.md) | Coach-created savings, spending-streak, and debt-payoff challenges. The data shape, the privacy model, and the "no leaderboard by default" rule. |
| 02 | [`leaderboards.md`](./02-leaderboards.md) | Opt-in, balance-redacted, coach-scoped leaderboards. Privacy budget, ranking math, abuse vectors. |
| 03 | [`profile-avatars.md`](./03-profile-avatars.md) | Profile images for coach + client. Storage, moderation, what "avatar" means for a luxury-register product. |
| 04 | [`content-boards.md`](./04-content-boards.md) | Coach content boards: PDFs, newsletters, links, video. Per-client assignment and visibility. |
| 05 | [`regimens.md`](./05-regimens.md) | Finance regimens / programs: multi-phase, multi-week structures coaches author once and assign to clients. |
| 06 | [`assignments.md`](./06-assignments.md) | The shared assignment primitive: a regimen, challenge, or content item assigned to a specific client (or cohort) with state. |
| 07 | [`messaging-progress.md`](./07-messaging-progress.md) | Coach-client messaging extensions: progress visibility, structured updates, and the notification surface. |
| 08 | [`entitlements.md`](./08-entitlements.md) | The L1/L2/L3 entitlement model for clients and the parallel coach-tier model. The single source of truth for "who can see what". |
| 09 | [`compliance.md`](./09-compliance.md) | Consumer-finance boundaries: what coaches may say, what the app may render, what we never auto-prescribe. |
| 10 | [`rollout-and-ops.md`](./10-rollout-and-ops.md) | Feature flags, analytics, telemetry, rollout cohorts, kill-switches, operator handoff. |

Anything labelled "fitness app" in those docs is reference-only —
**none** of the fitness app's runtime code is imported, called, or
mirrored at the schema level. The only cross-app surface is the
existing federation read path (`/api/admin/federation/*`).

---

## 3. WHO this is for

Three personas, in order of appearance on a given screen.

### 3.1 The student (client)

A user with `role = student`. Today they see their own dashboard, their
own EOD check-in, their own priority waterfall, and a privacy-scoped
view of an accountability partner. After this work, they may:

- be **enrolled** in zero or more **regimens** authored by their coach,
- be **assigned** zero or more **challenges** (subset of regimen, scoped
  shorter),
- have a **content board** rendered to them with the items their coach
  has assigned (PDFs, newsletters, videos, links),
- optionally appear on a **leaderboard** (only with explicit consent,
  never showing balances, see §02),
- have a **profile image** they have set themselves (see §03).

A student **cannot** create a regimen, a challenge, content, or a
leaderboard. They consume; they do not author.

### 3.2 The coach

A user with `role = coach`. Today they see a roster, alerts, per-client
detail, weekly digest, and program templates (lightweight, single-table
today). After this work, they may:

- author **regimens** (multi-phase, multi-week, reusable across
  clients),
- author **challenges** (shorter, often single-metric, can be
  cohort-wide),
- maintain a **content board** of artefacts they assign to clients,
- run **leaderboards** scoped to clients who have opted in,
- set a **coach profile** (display name, bio, avatar, public-link
  surface) the unified admin console can render.

A coach **cannot** see another coach's roster, regimens, content,
challenges, or leaderboards. The tenancy model in
`backend/docs/TENANCY.md` §1 extends unchanged: coach-keyed resources
are scoped by `coach_id`, owner has explicit cross-tenant bypass.

### 3.3 The owner (operator)

A user with `role = owner`. Today they administer everything via
`/api/admin/*` plus the federation surface to the fitness console. After
this work, they additionally:

- moderate uploaded content (report queue),
- adjust entitlement tiers on accounts (L1 → L2 promotion, see §08),
- inspect challenge/regimen activity for a coach for incident response,
- toggle the global feature flags (§10) without a deploy.

There is no new role. The existing three (`coach`, `student`, `owner`)
cover the surface. The unified admin console reads the same federation
endpoints the fitness backend already calls.

---

## 4. WHAT each spec document delivers

Each downstream document is required to answer the **same six WH
questions** (why, when, where, who, what, how) plus a fixed structural
checklist. The checklist is the operator handoff: if a section is empty
the doc isn't ready.

### 4.1 Required sections per spec

1. **Why** — the user / business / doctrine reason for the surface.
2. **When** — the lifecycle of the artefact: when it is created, when
   it is shown, when it expires, when it is deleted, and when the
   client / coach / owner sees what.
3. **Where** — backend module(s) and mobile route(s) it lands in.
   Always names the closest existing module so the reader knows the
   neighbourhood.
4. **Who** — the role(s) that read, the role(s) that write, and the
   tenancy boundary.
5. **What** — the data model (Prisma sketch), the API surface (REST
   table), the UX surface (screen + nav).
6. **How** — the implementation pattern: which guards, which Zod
   schemas, which tests pin which invariants.
7. **Privacy & security** — what is hidden from whom, where in the code
   the boundary lives, what schema changes would accidentally widen it.
8. **Abuse & moderation** — concrete abuse vectors (impersonation,
   doxx, money-flag, advice-overreach) and the ladder of mitigations.
9. **Feature flags** — the flag(s) that gate the surface, who can flip
   them, the off-state behaviour.
10. **Analytics** — events emitted, which dashboards consume them,
    what "healthy" looks like.
11. **Rollout** — cohort plan (founders → consenting coaches → general
    availability), kill-switch, rollback contract.
12. **Tests** — the doctrine-pin tests + the behavioural tests that
    must exist before merge.
13. **Risks** — the top three things that go wrong, and the planned
    response for each.
14. **Dependencies** — other spec documents, federation surface
    changes, schema migrations, mobile routes, env vars.
15. **Acceptance criteria** — the bullet list reviewers tick before the
    feature can ship past internal cohort.
16. **Operator handoff** — `flyctl secrets set …`, `npm run …`,
    "promote first user", "open kill switch" — exactly what a
    non-author has to know to run it on call.

### 4.2 What "data/API sketch" means

If the surface lives **only** in finance, the spec includes a complete
Prisma model sketch with the same conventions as
`backend/prisma/schema.prisma` (snake_case columns, `@@map`,
`Decimal(14,2)` for money, `Json` only when the shape is itself
data-driven, soft-delete via `deleted_at` rather than removed rows).

If the surface is **shared** with the fitness backend, the spec calls
that out and proposes either:

- a **federation extension** (a new endpoint under
  `/api/admin/federation/*`) with the same `503 FEDERATION_DISABLED`
  + `401 FEDERATION_UNAUTHENTICATED` semantics as the existing surface,
  or
- a **shared identity column** (`shared_identity_id`) populated by the
  email-mapping fallback documented in `README.md` §"Where this app
  sits in the TGP product".

A shared-row-in-shared-database model is **out of scope** — the two
backends remain independent Postgres tenants. Cross-app data is read
through the federation surface only.

---

## 5. WHEN — the lifecycle the specs assume

Each of the new artefacts (regimen, challenge, assignment, content
item, message, leaderboard entry, avatar) has the same five-state
lifecycle:

1. **Drafted** by the coach. Not visible to clients. Not counted in
   analytics. Editable freely.
2. **Published** by the coach. Visible to assigned clients only.
   Edits are versioned (see `regimens.md` §How).
3. **Assigned** to a client (or cohort). Creates an `Assignment` row
   with state `pending → active → complete | abandoned | rescinded`.
4. **Archived** by the coach. Hidden from new assignments but readable
   in audit / progress history. This is the soft-delete state.
5. **Removed** by the owner only, in response to a content report or a
   GDPR-style erasure request. This is the only hard-delete path.

Lifecycle transitions emit structured events (see §10) so the timeline
in the coach dashboard is reconstructible without reading the row
history.

---

## 6. WHERE — the architectural seams

### 6.1 New backend modules

All new modules live under `backend/src/` and follow the existing
module shape (`*.controller.ts`, `*.service.ts`, `*.module.ts`,
`README.md`):

- `programs/` — regimens, phases, assignments. Folds the existing
  `ProgramTemplate` model into a richer `Program` + `ProgramPhase` +
  `ProgramAssignment` triple.
- `challenges/` — challenges, challenge participation, challenge
  events (a "I logged my no-spend Sunday" row).
- `content/` — coach-uploaded artefacts. Storage is **not** in
  Postgres; we use Supabase Storage with signed URLs and a
  `ContentItem` row holding metadata + the storage key.
- `leaderboards/` — opt-in, coach-scoped, balance-redacted boards.
  Pure read surface; rows are derived from challenges + EODs.
- `media/` — profile avatars (also Supabase Storage, separate bucket
  with public-read but URL-unguessable).
- `assignments/` — the shared assignment primitive. Either folded
  into `programs/` or carved out depending on the eng-lead call in
  `assignments.md` §How.

Each module gets a `README.md` matching the shape used by every
existing module README (purpose, key files, endpoints, data flow,
security/tenancy, env vars, failure modes, tests, operations). The
existing module READMEs are the template — see
`backend/src/coach/README.md` for the canonical example.

### 6.2 New mobile routes

```
mobile/app/
  programs/                # Student: enrolled regimens + active challenges.
    index.tsx              # List of active programs.
    [id].tsx               # Program detail (phases, current week, content).
  challenges/
    index.tsx              # List of active challenges (coach-assigned).
    [id].tsx               # Challenge detail + log surface.
  content/
    index.tsx              # Student-facing content board (assigned items).
    [id].tsx               # Content viewer (PDF, video, newsletter, link).
  leaderboard.tsx          # Coach-scoped, opt-in leaderboard. Behind L2.
  coach/
    programs/              # Coach: author regimens.
    challenges/            # Coach: author + run challenges.
    content/               # Coach: content board management.
    leaderboard.tsx        # Coach: leaderboard view across own roster.
    profile.tsx            # Coach: edit display name + bio + avatar.
```

The existing `mobile/app/coach/student/` detail surfaces gain
**inline** sections for "current programs", "active challenges",
"recent content delivery", "messaging progress" — they are not new
top-level screens for the coach.

### 6.3 New federation read paths

The federation surface in `backend/src/admin/` gains read endpoints
the unified admin console will use to render coach summaries:

- `GET /api/admin/federation/coach/:email/programs`
- `GET /api/admin/federation/coach/:email/challenges`
- `GET /api/admin/federation/coach/:email/content-stats`

These follow the existing federation contract: bearer-gated by
`FEDERATION_SERVICE_TOKEN`, return `503 FEDERATION_DISABLED` when the
env var is unset, surface `identityMapping: 'email'` so the console
can warn on one-sided matches.

---

## 7. HOW — the architectural decisions taken once, here

These decisions hold across every downstream spec. They are the cheap
ones to get right early and expensive to revisit later.

### 7.1 Programs and challenges share an `Assignment` row

A program assignment and a challenge assignment have the same
five-state lifecycle (§5), the same coach-scoped tenancy, and the
same progress-event stream. We model them as one shape with a
`kind: program | challenge | content` discriminator rather than three
parallel tables. Reasoning:

- The coach dashboard wants a single "what is this client doing"
  list, not three.
- The notification surface wants a single "this client was assigned
  X" event, not three.
- The federation surface wants a single denominator for "engagement",
  not three.

The trade-off is a slightly polymorphic table. We accept it because
the alternative is three near-identical tables that must be UNIONed
on every coach dashboard load.

### 7.2 Money never appears in a leaderboard, ever

Every leaderboard rank is computed from a **score** or a **cadence
metric** (consecutive no-spend days, percent-to-debt-goal, savings-rate
delta). The score is a number on `[0, 100]` or a count. **Dollar
amounts are never the rank metric and never appear in the rendered
row.** The wire payload from `/leaderboards/*` does not contain a
`Decimal` field. This is enforced both at the Zod boundary
(`LeaderboardEntrySchema` rejects any `MoneyAmount`) and pinned by a
test (`leaderboards.privacy.spec.ts`) — see `02-leaderboards.md` §How.

### 7.3 Content storage is Supabase, not Postgres

PDFs, recorded sessions, and newsletter exports are uploaded to
Supabase Storage. Postgres holds only the metadata row + the storage
key + the per-assignment access record. Reasoning:

- Postgres `bytea` columns and Prisma do not get along at scale.
- Supabase Storage gives us signed URLs out of the box.
- The fitness app has the same pattern; the unified admin console can
  read both with the same code path.

### 7.4 No public web profiles in this PR

The fitness app has public coach / client web profiles. Finance does
not, and this spec set does not propose them. A coach has a "public
display name + bio + avatar" surface that is **only** rendered inside
the authenticated mobile app (e.g. when a prospect taps an invite
link, the invite landing page may render the coach's public surface,
but the surface is never crawl-indexed and never linkable from Google
Search). The reasoning is in §11: a public client web profile that
links money behaviours to a real name is a hard regulatory line we
will not cross in v1.

The `new-website/` directory in this repo (if it exists) is **out of
scope** for this spec set. We confirm in the PR description that this
work does not modify it.

### 7.5 Feature flags are global + per-coach

Every new surface is gated by:

1. A **global flag** (`FEATURE_PROGRAMS_ENABLED=true|false`) the owner
   flips via environment.
2. A **per-coach allowlist** (`coach_profiles.feature_flags Json`)
   the owner toggles via `/api/admin/...`.

A surface is on for a request iff both are true. This lets us ship
the code, leave it dark globally, and turn it on for a single
founding coach to validate, before opening the door wider. The
fitness app uses the same pattern; the federation read paths render
the per-coach state into the unified console.

### 7.6 Doctrine pinning tests extend, do not branch

The existing pin tests in `backend/test/`
(`ai-prompt-doctrine.spec.ts`, `system-trust-meta.spec.ts`,
`tenancy.spec.ts`) are extended with new cases for the new surfaces.
We do not branch on "is the new surface flagged on?" — the doctrine
applies whether the flag is on or off. Specifically:

- Trust Center capability flags must continue to match what the
  backend implements end-to-end (`system-trust-meta.spec.ts`).
- Tenancy tests gain coach-scoped variants for every new module
  (`tenancy.spec.ts`).
- A new `doctrine-leaderboard.spec.ts` pins the no-money rule (§7.2).
- A new `doctrine-content-moderation.spec.ts` pins the
  signed-URL-required rule for assigned content.

---

## 8. The L1 / L2 / L3 entitlement model (read full detail in §08)

The fitness app uses a tiered entitlement model (L1 baseline, L2
coach-led, L3 white-glove). Finance adopts the same shape with the
finance-appropriate gating:

- **L1 — solo client.** Every behaviour the app already ships:
  net-worth tracking, EOD check-in, priority waterfall, what-if
  scenarios, AI coach, milestones, accountability pairing,
  community feed.
- **L2 — coach-led.** Adds: coach-assigned regimens, coach-assigned
  challenges, coach content board, coach messaging beyond the
  current single-thread, opt-in leaderboard membership.
- **L3 — concierge.** Adds: priority support response (24h SLA),
  scheduled 1:1 sessions surfaced in the app, the founding-member
  identity title surface, expanded what-if scenarios that today are
  rate-limited (the AI coach rate limit raises from 20→60 req/hr).

The model is **per-client**, not per-coach. A single coach may have
clients on L1, L2, and L3 simultaneously. The `users.entitlement_tier`
column is the single source of truth and is set by the owner via
`/api/admin/users/:id/tier`. Stripe / billing integration is out of
scope here — the column accepts a tier; how it gets there is a
separate ops doc.

A separate **coach tier** model exists too (`coach`, `coach_premium`)
gating how many clients a coach may host, how many regimens they may
publish, and whether their content board accepts video. See
`08-entitlements.md` §Coach tiers.

---

## 9. Privacy & security — global rules

These rules hold for every downstream spec; the spec only restates
them when it deviates.

1. **Balances never leave the authenticated owner's screen.** No
   downstream surface — leaderboard, challenge progress, coach detail
   — exposes a balance to anyone but the user themselves and (for
   their assigned coach only) the totals already exposed by
   `coach.service.ts`.
2. **Coach scoping is enforced at three layers** (route guard, service
   assertion, and Zod input rejection). New modules follow the
   existing `OwnsStudentGuard` + `assertCoachOwnsRecord` pattern.
3. **Owner bypass is explicit** in every service method that is
   roster-scoped. Implicit bypass is a regression.
4. **Signed URLs only** for assigned content. The Supabase Storage
   bucket is non-public; URLs are minted by the backend and expire on
   a 5-minute window. A leaked URL is short-lived.
5. **Avatars are public-read by URL**, but the URL contains a
   per-image random suffix so enumeration is infeasible. We do not
   put avatars behind signed URLs (the latency cost on a list view
   is too high), and we accept that a leaked avatar URL is leaked
   forever — the row carries a `replace_with_uuid` rotate path.
6. **PII never goes in event payloads.** Analytics events carry
   user IDs, not emails, names, or balances.

---

## 10. Compliance posture — the consumer-finance line

Finance is regulated. Fitness is not (in the same way). The relevant
risks for this spec set are:

- A coach phrasing a challenge as "buy these ETFs and hold for 30
  days" → investment-advice territory.
- A coach phrasing a regimen as "consolidate your debt with Lender X"
  → mortgage / credit-counselling territory.
- A leaderboard surfacing dollar deltas that, in aggregate, let an
  observer reverse-engineer a household income → consumer-privacy
  territory.

The spec set draws a **bright line**:

- Coaches author **behaviours** (save consistently, pay above minimum,
  reduce a category). Coaches do **not** author **product
  recommendations** (which lender, which fund, which card). The
  challenge schema rejects URL fields pointing at financial product
  vendors at submission time (`09-compliance.md` §How — URL allowlist).
- The app's existing disclaimer (`README.md` § Disclaimer) is
  surfaced verbatim on every regimen / challenge / content item the
  coach publishes. This is rendered by the backend, not the coach,
  so it cannot be turned off.
- A leaderboard row never carries a money number, and the score
  metric is privacy-budgeted (§02 §Privacy budget) so cohort
  membership cannot be reversed into per-person spending.

Full detail in `09-compliance.md`.

---

## 11. Acceptance criteria for this spec set (not the feature)

This PR is documentation only. The criteria below are what we tick
before we **merge the spec PR**, not before we ship the feature.

- [ ] Every downstream spec answers all 16 required sections (§4.1).
- [ ] Every spec names the closest existing backend module so the
      reader can locate the neighbourhood.
- [ ] Every spec lists at least three concrete abuse vectors and the
      planned mitigation.
- [ ] Every spec lists the feature flag(s) that gate it, the
      kill-switch behaviour, and the rollout cohort.
- [ ] The compliance doc (`09-compliance.md`) is reviewed by
      legal / compliance counsel and signed off in the PR thread.
      (We do not merge the spec set without this signature.)
- [ ] The federation surface additions are listed in `README.md`
      §"Where this app sits in the TGP product" with the same shape
      as the existing endpoints.
- [ ] The mobile design implications are signed off against
      `mobile/DESIGN.md` §1 (palette), §2 (no emoji), §5 (voice).
- [ ] The PR confirms `new-website/` is **not** modified.

---

## 12. What this spec set does NOT cover

To prevent scope creep on review:

- **Billing / Stripe / paid upgrade flow.** The entitlement column
  accepts a tier; how it gets there is a separate ops doc.
- **A web-facing coach profile page** beyond the in-app surface.
- **Group video sessions / live streaming.** Out of scope; we link
  out to whichever video tool the coach already uses.
- **A native chat surface beyond the existing coach-client thread.**
  See `07-messaging-progress.md` for what we do and do not extend.
- **Cross-coach client transfer.** The existing manual ops path
  (`README.md` § Operator actions) remains.
- **A public community feed.** The existing community feed
  (`backend/src/community/README.md`) is unchanged. The new surfaces
  are coach-scoped, not platform-wide.

---

## 13. Dependencies between spec documents

```
08-entitlements        ← read first; everything else assumes its tier model
05-regimens            ← depends on 06-assignments (which folds into it for v1)
01-challenges          ← depends on 06-assignments + 02-leaderboards
04-content-boards      ← depends on 06-assignments
02-leaderboards        ← depends on 01-challenges
03-profile-avatars     ← independent
07-messaging-progress  ← depends on 05-regimens + 01-challenges
09-compliance          ← reviewed alongside 01, 04, 05; gates the spec PR merge
10-rollout-and-ops     ← read last; references every other spec's flag
```

A reviewer who reads the docs in this order can review the spec set
without having to flip back and forth.

---

## 14. Risks (top three for the spec set itself, not the feature)

1. **Scope creep to a marketplace.** Coaches will ask for "let
   prospects browse my regimens before they enrol". That is a public
   web surface and crosses the line drawn in §7.4. The spec set
   refuses this in v1; the rejection is documented in
   `05-regimens.md` § Out of scope.
2. **Confusing the L2/L3 line.** If the entitlement doc is ambiguous
   the implementation will diverge. §08 has to be the source of
   truth and every other doc cites it instead of restating it.
3. **The fitness app changing its leaderboard model.** Finance is
   not a fork of fitness; the federation surface is read-only. A
   change in fitness's leaderboard schema does not migrate finance.
   This is a feature, not a bug — but the spec set says so
   explicitly so a future ops question doesn't end with "well, the
   fitness app changed it, so…".

---

## 15. Operator handoff for this spec set

Once the spec PR merges:

- The `docs/specs/coach-led-programs/` directory is the canonical
  reference for any feature work on these surfaces.
- The implementing PRs reference the spec by file + section, e.g.
  `docs/specs/coach-led-programs/01-challenges.md §How`.
- A spec-update PR is required whenever an implementing PR diverges
  from the spec — implementation drift without a spec amendment is
  a review-gate failure (mirrors the `README.md` §"Documentation
  rule" gate in the repo root).
- The owner can read `10-rollout-and-ops.md` standalone to run the
  rollout once any feature ships.
