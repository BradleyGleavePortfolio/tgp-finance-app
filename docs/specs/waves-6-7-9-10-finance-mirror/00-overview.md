# 00 — Overview: Waves 6 / 7 / 9 / 10 finance mirror

> **Status:** draft, documentation-only.
>
> The cross-wave narrative. Read once before opening the
> wave-specific spec.

## 1. The wave map (finance side)

| Wave | Owner repo | This repo's role | Status as of 2026-05-01 |
|---|---|---|---|
| 1 | `growth-project-backend` + this repo | shipped | ✅ on `main` (this repo: PR #88, #91, #92, #93, #100, #101, #102) |
| 2 | `growth-project-backend` | mirrors `org_memberships` read-only | dep for runtime; cross-repo spec in flight |
| 3 | `growth-project-backend` | finance bridge endpoints (`/api/admin/finance/*`) | shipped (PR #92) |
| 4 | `growth-project-mobile` | consumer of `/api/v1/org/:id/revenue/*` (PR #109) | cross-repo spec in flight |
| 5 | this repo (PR #109) | the spec is here | DRAFT, unmerged |
| 6 | this repo (this set) | the spec is here for finance scopes | DRAFT, this PR |
| 7 | this repo (this set) | finance trust-signal posture | DRAFT, this PR |
| 8 | this repo (PR #110) | payout rail | DRAFT, unmerged |
| 9 | this repo (this set) | storefront finance blocks + community privacy | DRAFT, this PR |
| 10 | this repo (this set) | identity mapping under privacy | DRAFT, this PR |

The finance app's **distinct concern** in every wave is the same:
the consumer-finance compliance line. Every cross-repo spec must be
audited for:

- **Outcome claim leakage** (any string, computed signal, or rank
  factor that implies a finance result).
- **Money-shape leakage** (any field containing a balance, salary,
  or net-worth value reaching a public surface).
- **Self-dealing** (any rank, attribution, or referral that allows
  a coach to game finance-data scoring of themselves).
- **PII concentration** (any join across `fitness` + `finance` that
  builds a richer profile than either side alone).

Each wave-specific spec in this set walks its surface and answers
all four.

## 2. Seam against PR #106, #108, #109, #110

| PR | Owns | This set extends |
|---|---|---|
| PR #106 (coach-led programs) | delivery primitives (challenges, regimens, leaderboards, content boards, messaging, entitlements, compliance) | Wave 9 reuses the leaderboard bucketing primitives; Wave 6 reuses the entitlements matrix; Wave 7 inherits the compliance line. |
| PR #108 (storefront / marketplace) | commerce, discovery, community, events, rewards, copilot | Wave 6 specs the **app permission scopes** that wrap PR #108 §05 (marketplace); Wave 7 specs the **trust signals** PR #108 §05 ranks on; Wave 9 specs the **funnel analytics + community privacy** for §01 / §06. |
| PR #109 (sub-coach billing split) | the split mechanism | Wave 10 specs the cross-product federation surface that **reads** the org rollups. |
| PR #110 (payout extensions) | the payout rail | Wave 6 (permission scopes) lists the rail's read surfaces under scopes; Wave 9 (community) inherits the money-shape doctrine pin. |

The seam is intentionally narrow: this set adds *new shapes*, not
new primitives. Where a primitive already exists in a sibling spec,
this set re-uses by reference.

## 3. OWNER decisions tabled in this set

The OWNER must ratify the following before the corresponding runtime
PR opens. Each is named here and re-cited in its wave's spec.

```
OWNER_DECISION  W6_PERMISSION_DEFAULT_NO
Wave: 6
Choices:
  A) Default to ALL scopes denied; coach must approve each (recommended).
  B) Default to common-scope set (read profile + read program).
Recommendation: A.
Consequence of A: more friction at app-install time, lower compliance risk.
Consequence of B: smoother UX, but a coach can install a finance-data app and forget to gate it.
```

```
OWNER_DECISION  W7_BOOST_CAP
Wave: 7
Choices:
  A) Editorial boost factor max 2.0× (recommended).
  B) Max 5.0×.
  C) No cap; OWNER moderates manually.
Recommendation: A.
Consequence of A: caps abuse; a coach cannot dominate the discovery feed by editorial alone.
```

```
OWNER_DECISION  W9_FUNNEL_CONSENT_DEFAULT
Wave: 9
Choices:
  A) Default OFF for analytics consent; coach explicitly opts in (recommended).
  B) Default ON; coach explicitly opts out.
Recommendation: A.
Consequence of A: smaller funnel-analytics dataset, GDPR-clean default.
Consequence of B: richer dataset, but a non-trivial fraction of coaches won't realise they're consenting.
```

```
OWNER_DECISION  W10_IDENTITY_MAPPING_V2
Wave: 10
Choices:
  A) Defer shared_identity_id to v2; email-only in v1 (recommended).
  B) Roll out shared_identity_id alongside email mapping in v1 (dual-write phase).
  C) Replace email mapping with shared_identity_id in v1 (single-write).
Recommendation: A.
Consequence of A: parity with PR #93's posture; no migration risk in v1; v2 plans the dual-write window then cutover.
Consequence of B: dual-write is reversible but doubles federation read work.
Consequence of C: not safe; requires a finished mapping table on every existing user.
```

## 4. Privacy and consumer-finance line

Every wave below preserves:

- **No raw money on a public surface.** Marketplace card, discovery
  feed, community post, replay, share card, OG-meta unfurl — all
  bucketed only.
- **No outcome claim.** "I helped X save $5k" is forbidden across
  every wave's surface; the outcome-claim filter (PR #106 §09) is
  applied at every write.
- **No PII concentration.** Federation responses (Wave 10) carry
  only the minimum fields needed for the unified admin console
  (per PR #93 doctrine).
- **Consent-first analytics.** Funnel events (Wave 9) ride a
  consent flag; default OFF.
- **Bucketed signals only on rank.** Discovery (Wave 7) ranks on
  buckets, not numbers.

These are pinned by the five doctrine specs listed in `README.md`.

## 5. Cross-repo dependencies (consolidated)

| Dep | Where | Used by |
|---|---|---|
| `app-permissions-spec.md` | `growth-project-backend` Wave 6 | `wave-6-marketplace-permission-scopes.md` |
| `discovery-trust-spec.md` | `growth-project-backend` Wave 7 | `wave-7-discovery-trust-signals.md` |
| `storefront-funnel-spec.md` | `growth-project-mobile` Wave 9 | `wave-9-storefront-funnel-analytics-and-community.md` |
| `federation-spec.md` | `growth-project-backend` Wave 10 (extends Wave 1 PR #93) | `wave-10-federation-identity.md` |
| `sub-coach-hierarchy.md` | `growth-project-backend` Wave 2 | Waves 6, 9, 10 (org_id ↔ scope; org membership ↔ federation) |

All four cross-repo specs are **expected to land first** in their
home repo. If a runtime PR derived from this set opens before its
cross-repo dep, the runtime PR pauses.

## 6. Acceptance for the spec set as a whole

- [ ] All 5 wave files exist and are self-contained.
- [ ] Each wave file has ≥ 5 failure modes documented.
- [ ] Each wave file has a state-transition table where stateful.
- [ ] Each wave file lists its doctrine-pin extension.
- [ ] OWNER decisions in §3 are tabled with choices/recommendation/consequences.
- [ ] No `new-website/` change.
- [ ] No runtime code in this PR.
