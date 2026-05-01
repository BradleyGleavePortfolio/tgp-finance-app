# 05 — Affiliate payouts (accrual, attribution, hold, clawback)

> **Status:** draft, documentation-only.
>
> This spec defines how an affiliate's commission is **accrued**,
> when it becomes payable, how attribution windows are enforced, and
> how clawback runs when a refund or chargeback wipes the source
> transaction.

## 0. Cross-repo dependencies

- PR #108 §04 (`04-affiliates-referrals.md`) — declares affiliate
  link, attribution, single-tier model. This spec defines the
  **payout** behaviour.
- `02-ledger-and-audit.md` — every accrual + clawback is a ledger
  row.
- `01-connect-onboarding.md` — affiliate must have an active Connect
  account before payout.

## 1. Affiliate commission lifecycle

```
        purchase happens
              │
              ▼
         attribution check       (within 14-day window?)
              │
        ┌─────┴─────┐
        no          yes
        │            │
   no commission   accrue (ledger pair)
                    │
                    ▼
              hold period (default 14 days)
                    │
              ┌─────┴─────┐
              │            │
       refund/chargeback   no event before hold ends
              │            │
              ▼            ▼
         clawback     payable
                          │
                          ▼
                    Stripe Transfer
                          │
                          ▼
                       paid (terminal)
```

States — closed enum `affiliate_commission_status ∈ {accrued, held,
payable, paid, clawed_back, void}`.

## 2. Attribution window enforcement

PR #108 §04 declares first-touch + 14-day attribution. This spec
makes that contract concrete.

- A click on an affiliate link sets a server-side `affiliate_attribution`
  cookie (or platform-side equivalent on mobile) bound to the user's
  device session. The cookie is hashed; the platform stores a
  hashed-id mapping in `affiliate_attribution` rows.
- On purchase, the runtime PR's checkout handler reads the freshest
  attribution that is:
  - For the same device / user.
  - Within 14 days of purchase.
  - Not yet **converted** (one referral → at most one commission per
    referrer per client per offer kind).
- If multiple attributions are eligible, **first-touch wins** (the
  earliest non-converted attribution within the 14-day window).
- If the attribution is to a coach who is the buyer or who is in the
  same `org` as the buyer, **no commission** (anti-self-referral; see
  `07-anti-fraud.md` §3.2).

## 3. Commission shape

The commission is computed off the **coach's net** (after platform
application_fee), not the gross. This is because:

- The platform takes its application_fee first; commissions are
  attributed to the coach's revenue.
- It avoids commission stacking with the platform fee (which would
  be double-billing the platform).

For a $100 gross with $5 fee and $95 net to coach, a 10% commission
is $9.50, recorded as:

```
debit  platform           affiliate_commission   9.50
credit affiliate (acct A) affiliate_commission   9.50
```

Stored on the `affiliate_commission` ledger pair. The coach's net is
**unaffected**; the platform absorbs the commission off its
application_fee. (The runtime PR's settings allow OWNER to switch
this to "coach absorbs" via a per-offer flag, but **default is
platform-absorbs**, which is the safest no-cliff design and keeps
the FTC disclosure clean.)

## 4. Hold period

Default hold: **14 days** from purchase. During the hold:

- The commission ledger pair already exists (status `accrued` →
  `held` after attribution validation).
- The funds are **on the platform balance**, not yet transferred to
  the affiliate's Connect account.
- A refund or chargeback during the hold runs through the cascade
  (`04-refund-and-chargeback-cascade.md`), generating a
  `refund_affiliate_clawback` row.

After the hold expires:

- Status moves `held → payable`.
- The `AffiliatePayoutBatcher` (a daily job at 03:00 UTC) batches
  payable commissions per affiliate and creates a Stripe Transfer.
- On Transfer success, status moves `payable → paid`.

The hold period is per-offer-kind:

| Offer kind | Default hold |
|---|---:|
| `one_time_program` | 14 days |
| `subscription` (first month) | 14 days |
| `subscription` (subsequent months) | 7 days |
| `payment_plan` | 14 days from final payment |
| `event_ticket` | 7 days **after** the event date (so a no-show refund still claws back) |
| `content_pass` | 14 days |

OWNER may override the hold per-offer in the admin admin (audited).

## 5. Clawback

When a refund or chargeback runs the cascade and the source had an
affiliate commission:

- A `refund_affiliate_clawback` ledger pair is inserted (debit
  affiliate, credit platform) for the proportional amount (per
  `04-` §2.1).
- The affiliate's account balance is debited via a Stripe Transfer
  Reversal **if the commission was already paid out**. If still in
  `held`, no Stripe call — only the ledger row.
- If the affiliate has insufficient balance for a Transfer Reversal
  (paid out and spent), the runtime PR's `AffiliateClawbackQueue`
  flips them to a `negative_balance` state; new commissions accrue
  but are **not paid out** until the negative is closed by future
  positive accruals or by an OWNER manual top-up (audited).

Hard-coded ceiling: an affiliate's `negative_balance` cannot exceed
**$500 USD** in absolute value. Beyond that, the OWNER queue requires
manual intervention before any new accrual is recorded. This protects
against runaway abuse.

## 6. FTC disclosure pin

PR #108 §04 declares the FTC disclosure constants. This spec pins
them to the runtime:

- The doctrine pin `payouts-affiliate-disclosure.spec.ts` asserts:
  - Every affiliate-link landing screen renders the verbatim
    disclaimer string from `affiliates/ftc-disclosure.constants.ts`.
  - The disclaimer string contains the substrings: "I may earn", "if
    you sign up", "no extra cost".
  - The affiliate's storefront card shows a small "affiliate" badge
    when the deeplink path includes `/r/<referrer_id>`.
- Removing or editing the disclaimer string requires updating the
  pin spec **and** compliance reviewer sign-off.

The disclaimer copy lives in `payouts/affiliates/ftc-disclosure.constants.ts`:

```ts
export const FTC_AFFILIATE_DISCLOSURE_VERBATIM = `
This is an affiliate referral link. If you sign up using this link, I
may earn a commission at no extra cost to you. The Growth Project
does not endorse any specific outcome and makes no income or savings
guarantees.
`.trim();
```

(Reserved name; runtime PR-W8-5 lands the constant.)

## 7. API surface

```
GET   /api/v1/payouts/affiliate/summary
  → 200 { accrued: { amount, currency }, held: { ... }, payable: { ... },
          paid_to_date: { ... }, clawed_back: { ... } }
  -- the affiliate sees their own; OWNER can read any with ?user_id

GET   /api/v1/payouts/affiliate/by-period?since=YYYY-MM&until=YYYY-MM
  → 200 { periods: [{ month, accrued, paid, clawed_back }, ...] }

GET   /api/v1/payouts/affiliate/by-source?cursor=...
  → 200 { rows: [{ purchase_id (opaque), offer_kind, amount, status, posted_at }, ...],
          next_cursor }
```

`Idempotency-Key` required on no GETs in this surface; payouts are
async (the daily batcher is the writer).

## 8. State-transition table

| From | To | Trigger |
|---|---|---|
| (none) | `accrued` | Purchase event with valid attribution. |
| `accrued` | `held` | Attribution validation passes (anti-self-referral, FTC disclosure rendered). |
| `accrued` | `void` | Attribution invalid (self-referral / out-of-window / FTC banner not rendered). |
| `held` | `payable` | Hold period expired without refund/chargeback. |
| `held` | `clawed_back` | Refund or chargeback during hold. |
| `payable` | `paid` | Stripe Transfer success. |
| `payable` | `clawed_back` | Late refund (e.g. event no-show after hold expired but before payout) — if Stripe Transfer is still in outbox `pending`, it's cancelled; if already paid, Transfer Reversal fires. |
| `paid` | `clawed_back` | Late refund / chargeback; Transfer Reversal. |
| any | `void` | OWNER manual void with reason ≥ 20 chars. |

## 9. Privacy / security

- Affiliate sees source rows as `opaque purchase_id, offer_kind,
  amount_band, status, posted_at`. The affiliate **does not** see
  the buyer's identity or the buyer's coach.
- OWNER admin can drill into source — but the drill is audit-logged.
- Affiliate's referral link is per-affiliate, single use across all
  campaigns; no per-campaign tracking parameters are stored
  (anti-PII drift).
- PostHog: `affiliate_commission_accrued`, `affiliate_payout_paid`,
  `affiliate_clawback` — all carry `amount_band`, never raw amounts.

## 10. Failure modes (≥ 5)

| # | Failure | Detection | Mitigation |
|---|---|---|---|
| 1 | Affiliate's Connect account is `restricted` when batcher runs | `PayoutEligibilityGuard` returns `not_payable` | row stays in `payable`; batcher retries daily; OWNER queue alert after 7 consecutive days |
| 2 | Affiliate balance has gone negative beyond $500 | `AffiliateClawbackQueue` halts new accruals | OWNER must manually close the negative; runbook in `08-reconciliation-and-payouts.md` §6 |
| 3 | Race: refund fires while batcher is mid-Transfer | outbox `Idempotency-Key` collision; one wins | clawback row is inserted regardless; if Transfer succeeded first, a Transfer Reversal is scheduled in outbox |
| 4 | Affiliate is also a sub-coach of the buyer's head coach (closed-loop self-deal) | `07-anti-fraud.md` §3.2 self-referral rule fires; attribution moves to `void` before commission is accrued | the rule is enforced at attribution time, not at payout time; ensures no clawback chain |
| 5 | Stripe Transfer Reversal fails (insufficient funds in destination) | outbox row goes `errored` after retries | OWNER queue surfaces; manual reconciliation required; `negative_balance` lock kicks in |
| 6 | FTC disclosure was not rendered on the landing screen (banner suppressed by a UI bug) | doctrine pin asserts the banner is rendered; missing render → CI failure | runtime PR cannot ship; the attribution row has a `disclosure_verified=false` flag that voids the commission if false at attribution time |
| 7 | A late refund reaches a `paid` commission whose Stripe Transfer Reversal is rejected because the affiliate already withdrew | Stripe error → `negative_balance` state | platform absorbs the loss as a `manual_adjustment` after OWNER review; metric counts these as "uncovered clawbacks" |

## 11. Acceptance criteria

- [ ] `affiliate_commission_status` is a closed TypeScript union.
- [ ] Hold period defaults match §4; OWNER override is audit-logged.
- [ ] FTC disclosure pin runs in CI.
- [ ] Self-referral / org-mate referral attribution is voided
  pre-accrual.
- [ ] Negative-balance ceiling is $500; doctrine pin asserts.
- [ ] No PostHog event carries raw amounts.
- [ ] OWNER drill into source is audit-logged.

## 12. Out-of-scope (explicit)

- Multi-tier MLM. Single-tier only.
- Per-affiliate negotiated commission rates beyond the offer-default
  + per-offer override (deferred).
- In-app Affiliate-link generator UI (lives on coach storefront per
  PR #108 §04; this spec is payout-only).
- Off-platform affiliate payouts (Stripe Connect only).
- Sub-affiliate referrals (a referrer referring another referrer).
