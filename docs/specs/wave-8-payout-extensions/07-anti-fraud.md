# 07 — Anti-fraud rules and OWNER review queue

> **Status:** draft, documentation-only.
>
> The platform's anti-fraud posture for v1 is a **closed rule set** +
> an **OWNER review queue** — no ML, no third-party fraud-score black
> box. Every block is explainable in plain English on the queue card.

## 0. Cross-repo dependencies

- PR #108 §04 (`04-affiliates-referrals.md`) — declares attribution
  rules; this spec adds the self-referral / org-mate-referral rule.
- PR #108 §06 (`06-community-spaces.md`) — declares money-shape
  scrubber for community posts; this spec extends to *deltas* across
  multiple posts (slow-leak detection).
- PR #108 §03 (`03-applications.md`) — declares deposit-paid /
  refund-grace; this spec adds deposit-cycling rule.
- `04-refund-and-chargeback-cascade.md` — chargeback-fraud rule fires
  off cascade outcomes.

## 1. WHY closed rules + queue

ML / black-box fraud scores have three problems for our v1:

1. **Explainability.** OWNER must justify every block; "score 87"
   is not a justification a coach or affiliate can act on.
2. **Adversarial drift.** A scored model retrains on noisy labels;
   we have neither the volume nor the labelling capacity.
3. **Liability.** A black-box score that blocks a user is a
   compliance hazard the platform absorbs; a closed-rule block is
   defensible.

So v1: five closed rules (one rule, one explanation, one block).
Each rule is independently feature-flagged so the OWNER can disable
a noisy rule without rebooting the platform.

## 2. Rule lifecycle

```
        signal arrives
              │
              ▼
        rules engine          (every rule runs, in parallel, on the same
                               event; rules don't talk to each other)
              │
        ┌─────┴─────┐
   no rule fires    one or more rules fire
        │                  │
   pass through       fraud_signals row inserted (one per rule)
                            │
                            ▼
                      severity check
                       │       │
                  low / medium  high
                       │       │
                  alert only   block + queue
                       │       │
                       └───┬───┘
                           ▼
                     OWNER review queue
                           │
                     accept / dismiss / escalate
                           │
                           ▼
                     audited action
```

A `block` halts the in-flight write (e.g. refund refused, accrual
voided, post hidden). An `alert` lets the write proceed but raises
the queue.

## 3. The five rules

### 3.1 Chargeback-fraud rule

Fires when a chargeback's pattern matches "friendly fraud" — the
buyer disputes a charge despite consuming the service.

Signals (any two = high severity):

- The buyer accessed the program / cohort / event after the purchase.
- The buyer disputed within 60 days but consumed > 50% of the
  delivered cohort weeks.
- The buyer has > 1 prior chargeback against any merchant on the
  same Stripe customer (Stripe Radar signal, surfaced via webhook).

Action: **alert** on a single signal; **block subsequent purchases
by the same buyer** on two signals (`block_buyer` action).

### 3.2 Self-referral / org-mate-referral rule

Fires when an affiliate's commission would be paid against a
purchase by:

- The affiliate themselves (same `user_id`).
- A coach in the same `org` as the affiliate (same `org_id` per
  Wave 5).
- A user whose first-touch attribution was via a deeplink the
  affiliate self-clicked (detected via device-bound
  attribution-cookie reuse).

Action: **block** the commission accrual (commission moves to
`void` per `05-affiliate-payouts.md` §8).

### 3.3 Deposit-cycling rule

Fires when an applicant pays a deposit, gets refunded within the
14-day grace, and re-applies for the same offer within 30 days. A
single cycle is a coincidence; a third cycle is a pattern.

Signals (combined for high severity):

- Same buyer, same offer, third application in 30 days.
- Buyer's prior two applications had `deposit_refunded` outcomes.

Action: **alert** on second occurrence; **block_application** on
third occurrence (the application is refused with
`409 DEPOSIT_CYCLING_DETECTED`).

### 3.4 Refund-abuse rule

Fires when a buyer's refund rate exceeds a threshold across all
coaches.

Signals:

- 3+ refunds in the trailing 90 days, **and**
- the latest refund's strategy was `pro_rata` (so coaches absorbed
  share each time), **and**
- buyer's median time-to-refund is < 7 days from purchase.

Action: **alert** to OWNER; **soft-block** (require manual OWNER
approval on next purchase). Doctrine prefers manual review here
because a buyer with a high refund rate may also be a buyer the
platform has wronged.

### 3.5 Money-shape leak rule

Fires when community posts (PR #108 §06) match patterns that the
PR #108 §06 scrubber missed:

- Posts with regex `\$\s?\d+[\d,]*\.?\d{0,2}` or `[\d,]+\.\d{2}\s*USD`
  hit a debounced counter per post.
- A user with > 5 distinct posts containing money-shape patterns in
  a rolling 14-day window.

Action: **alert** on first violation (auto-mute the post pending
review); **block_user_from_posting_in_spaces** on third violation.

## 4. Severity ladder

| Severity | Effect |
|---|---|
| `info` | logged only; no row in the queue (used for telemetry tuning) |
| `low` | row added to queue with status `unreviewed`; in-flight write proceeds |
| `medium` | row added; in-flight write proceeds; OWNER notification fires |
| `high` | row added; in-flight write **blocks**; OWNER notification + paged |

## 5. Schema

```
table  fraud_signals
  id                       uuid          PK
  rule                     text          NOT NULL  -- one of the five rule names
  severity                 text          'info' | 'low' | 'medium' | 'high'
  subject_kind             text          'user' | 'org' | 'commission' | 'application' | 'post'
  subject_id               uuid          NOT NULL
  triggered_event          jsonb         NOT NULL  -- the input event (redacted of money)
  rule_explanation         text          NOT NULL  -- plain English; ≥ 1 sentence
  recommended_action       text          NOT NULL  -- 'block_buyer' | 'block_application' | 'void_commission' | 'auto_mute_post' | 'soft_block_purchase' | 'alert_only'
  detected_at              timestamptz   NOT NULL DEFAULT now()
  status                   text          'unreviewed' | 'accepted' | 'dismissed' | 'escalated'
  reviewed_by              uuid          NULL
  reviewed_at              timestamptz   NULL
  reviewer_reason          text          NULL  -- ≥ 20 chars on accept/dismiss

  INDEX (status, severity, detected_at DESC)
  INDEX (subject_kind, subject_id)
```

Append-only? **No** — this is one of the few mutable surfaces in
Wave 8, because review state is mutable. The mutation is bounded:
`status` and the three `reviewed_*` fields only.

## 6. API surface (OWNER only)

```
GET   /api/v1/admin/fraud/queue?status=unreviewed&severity=high&limit=50
  → 200 { rows: [...], next_cursor }

POST  /api/v1/admin/fraud/:id/accept
  body: { reason: string ≥ 20 chars }
  → 200 { applied_action }

POST  /api/v1/admin/fraud/:id/dismiss
  body: { reason: string ≥ 20 chars }
  → 200 { ok }

POST  /api/v1/admin/fraud/:id/escalate
  body: { reason: string, escalate_to: 'owner' | 'compliance' }
  → 200 { ok }
```

`Idempotency-Key` required on POSTs. Every mutation writes a
`payout_audit_events` row.

## 7. Privacy / security

- The `triggered_event` jsonb is **scrubbed of money**; only bands
  + counts. The scrubber is a doctrine pin
  (`payouts-fraud-scrub.spec.ts`) — any field matching
  `/amount|balance|usd|salary|income/i` is masked or redacted before
  insert.
- Subject's email / phone are **not** in the row; the OWNER queue
  joins to the users table at read time only.
- PostHog: `fraud_signal_fired` carries `rule`, `severity`,
  `subject_kind`. No subject ID or money.
- Rule code paths are heavily logged with breadcrumbs; production
  log stripped of money before shipping to Sentry.

## 8. State-transition table

| From | To | Trigger |
|---|---|---|
| (none) | `unreviewed` | Rule fires; row inserted. |
| `unreviewed` | `accepted` | OWNER POST `/accept`; the recommended action is applied. |
| `unreviewed` | `dismissed` | OWNER POST `/dismiss`; the recommended action is **not** applied. |
| `unreviewed` | `escalated` | OWNER escalates to compliance reviewer. |
| `escalated` | `accepted` / `dismissed` | Compliance reviewer's decision. |
| any | (no terminal mutation) | reviewed rows stay in the queue with `status` for audit. |

## 9. Failure modes (≥ 5)

| # | Failure | Detection | Mitigation |
|---|---|---|---|
| 1 | Rule false-positive blocks a legitimate purchase | OWNER queue review; soft-block path | every `high` action requires OWNER review; `low/medium` are alert-only |
| 2 | Rule misses a fraud pattern (false negative) | OWNER manual report; metric of `chargeback_after_no_signal` | rules are reviewable + extensible; new rules are a runtime PR with the same shape |
| 3 | Rules conflict (e.g. self-referral and refund-abuse fire on the same event) | rules don't communicate; both rows are inserted; OWNER reviews both | recommended_action union is applied (most-restrictive wins) |
| 4 | A `block_buyer` action blocks a buyer who needs to refund a different coach's purchase | the block applies only to *new purchases* of the same offer family; refunds are not blocked | block scope is explicit: `block_buyer_from_purchases`, **not** `block_buyer_from_app` |
| 5 | OWNER mass-accepts the queue without reviewing | each accept requires `reason` ≥ 20 chars; bulk-accept endpoint does **not** exist | a future bulk-accept endpoint, if added, requires a per-row reason or a single platform-level reason ≥ 100 chars |
| 6 | A signal carries money in `triggered_event` due to a missed scrubber field | doctrine pin scans every rule's input shape | the rule's input shape is declared in TypeScript; the doctrine pin walks the type and rejects unmasked fields |
| 7 | Rule is disabled mid-day by OWNER and a fraud event slips through | the disable is audit-logged; signal still fires at `info` severity (rule is "shadow-on") | shadow-on mode runs the rule but does not block; lets the OWNER see what they would have caught before re-enabling |

## 10. Acceptance criteria

- [ ] Five rules exist as a closed TypeScript union.
- [ ] Each rule has a named `explanation` string ≥ 1 sentence.
- [ ] No rule's `triggered_event` carries raw amounts.
- [ ] OWNER queue is gated behind `RoleGuard('owner')`.
- [ ] Each accept / dismiss / escalate writes an audit row with
  `reason` ≥ 20 chars.
- [ ] Disabling a rule moves it to `shadow-on` (signals fire,
  actions don't); doctrine pin asserts.

## 11. Out-of-scope (explicit)

- ML fraud assist (deferred to Wave 11).
- Third-party fraud-score integration (Sift, Forter, etc).
- IP-reputation databases (deferred; rate limiting at the WAF
  is the only IP control in v1).
- Device-fingerprinting beyond the existing attribution cookie
  (deferred).
