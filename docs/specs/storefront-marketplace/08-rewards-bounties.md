# 08 — Rewards & bounties

> **Status:** draft, documentation-only. Authorises runtime PR-FS-9 (rewards).

## 1. WHY

The single most fragile surface in this product is anything that
*resembles* a financial reward. A finance app that ships a
"reward" without thinking risks one of three regulatory regimes:

1. **Investment products** ("earn 5% APY on your savings tracker")
   — the SEC / FINRA / state regulator regime.
2. **Sweepstakes / gambling** ("spin to win an extra $50 off your
   debt") — the state gaming regulator regime.
3. **Prize promotions / lottery** ("the highest saver this month
   wins $1,000") — federal + state lottery regime.

We hit none of these by being categorical: rewards are
**behavioural recognition** of *EOD-derived* milestones (saved on
N consecutive days, paid down a debt bracket, completed a
spending-streak block). Where there is a cash-shaped component
(coach-funded credit toward another offer; platform-funded
credit), the reward is **de-risked into a coupon** with explicit
copy, no randomness, no "win", and a clear funder identification.

The one-line claim:

> A coach can fund a reward that fires on a behavioural milestone;
> the platform can fund a reward as well; rewards are never
> yields, never prizes, never random; every claim screen names
> the funder, the trigger, and the verbatim "not investment, not
> prize, not gambling" disclaimer.

## 2. WHEN

PR-FS-9 ships once:

- Counsel signs off on the §9 disclaimer corpus.
- The closed list of behavioural triggers (§5.2) is approved.
- The funding model (coach credit vs platform credit, no actual
  cash) is approved.
- A tax-disclosure copy block is pinned (cash-equivalent rewards
  may be taxable income to the recipient).

## 3. WHERE

- `backend/prisma/schema.prisma` — `Reward`, `RewardTrigger`,
  `RewardClaim`, `RewardFundingPool`.
- `backend/src/rewards/`.
- `mobile/app/(rewards)/` — discover, my rewards, claim, history.
- `backend/src/rewards/triggers/` — pure functions evaluating
  behavioural state from existing EOD data.
- `backend/test/rewards-compliance.spec.ts`,
  `backend/test/rewards-trigger.spec.ts`.

## 4. WHO

| Actor | Capability |
|---|---|
| Coach | Fund a reward against own clients; pick from the closed list of trigger kinds; set the credit amount (capped); write a non-promotional title (filtered). |
| Coach Premium | Same plus credit redemption against own offers (a coach-funded credit can be applied to that coach's checkout). |
| Client | View available rewards; auto-progress (no manual claim for the milestone — the trigger is automated); claim the unlocked credit; redeem against an eligible offer. |
| Platform | Fund platform-wide rewards (tiny, infrequent, doctrine-correct). |
| OWNER | View all rewards, funding pools, claim history; force-cancel; refund any unclaimed funding. |
| Compliance | Spot-check titles, descriptions, and funding pool balances. |

## 5. WHAT

### 5.1 What a reward is **not**

- Not a yield. Not "earn X%". Not "pays interest".
- Not a prize. Not "win $X". Not random.
- Not a sweepstakes. Not "highest saver wins". Not a leaderboard
  payout.
- Not a draw. Not a wheel. Not a chest. Not a loot box.
- Not a guarantee. Not "if you save N days you get $X for sure"
  if the cash value of the reward exceeds a threshold (default
  $50). Above the threshold, the reward is **discretionary**, the
  coach must explicitly fund it before claim, and the disclaimer
  copy says so.
- Not money. The platform never pays cash. Rewards are credits
  redeemable inside the app against eligible offers.

### 5.2 The closed list of behavioural triggers

Adding a kind is a schema migration. Every kind reads from
existing EOD-derived data; no new data shape is introduced.

| Trigger | Reads from | Example |
|---|---|---|
| `savings_streak_days` | EOD save-marker → consecutive days with positive save | "Save on 30 consecutive days" |
| `debt_bracket_cross` | Debt strategies module → bracket boundaries | "Cross from 'high debt' to 'mid debt'" |
| `spending_streak_completed` | Daily spending mini-habit | "Complete one spending mini-habit for 14 days" |
| `priority_level_advance` | Priority Waterfall | "Advance from level N to level N+1" |
| `wvs_level_up` | Wealth Velocity Score | "Move up one named WVS level" |
| `eod_streak_length` | EOD check-in streak | "Submit EOD on 60 consecutive days" |

Each trigger is a **pure function** of existing EOD-derived state;
the evaluator is a nightly job + a webhook on EOD submit.

### 5.3 Reward object

```prisma
model Reward {
  id                String         @id @default(cuid())
  coach_id          String?        // null for platform-funded
  funded_by         FundedBy
  trigger           RewardTrigger
  trigger_params    Json           // e.g. { days: 30 } or { from: 'high', to: 'mid' }
  title             String         @db.VarChar(80)
  description       String         @db.VarChar(500)
  credit_cents      Int            // capped (default 5000 = $50)
  redeem_against    RedeemAgainst  // 'any_offer_by_funder' | 'specific_offer'
  redeem_offer_id   String?        // when 'specific_offer'
  audience          AudienceScope  // 'coach_roster' | 'cohort' | 'all_l1' | 'all_l2' | 'all_l3'
  audience_id       String?
  funding_pool_id   String
  state             RewardState    @default(active)
  expires_at        DateTime?
  filter_blocked    Boolean        @default(false)
  created_at        DateTime       @default(now())
}

enum FundedBy { coach platform }
enum RewardTrigger {
  savings_streak_days debt_bracket_cross spending_streak_completed
  priority_level_advance wvs_level_up eod_streak_length
}
enum RedeemAgainst { any_offer_by_funder specific_offer }
enum RewardState { active paused expired retired }
enum AudienceScope { coach_roster cohort all_l1 all_l2 all_l3 }
```

```prisma
model RewardClaim {
  id                String         @id @default(cuid())
  reward_id         String
  client_id         String
  unlocked_at       DateTime
  redeemed_at       DateTime?
  redeemed_order_id String?        @unique
  refunded_at       DateTime?
  state             ClaimState     @default(unlocked)
}

enum ClaimState { unlocked expired redeemed refunded }
```

```prisma
model RewardFundingPool {
  id                String         @id @default(cuid())
  funder_kind       FundedBy
  funder_id         String?
  balance_cents     Int            @default(0)
  reserved_cents    Int            @default(0)
  state             PoolState      @default(active)
  created_at        DateTime       @default(now())
}
```

A coach funds their pool by transferring from their balance (when
billing PR is live) or by pre-paying via a one-time charge.
Platform pool is funded out-of-band by OWNER.

### 5.4 The trigger evaluator

A pure function `evaluate(reward, client_state) → boolean` runs:

- Nightly across all active rewards.
- On EOD submit (only the relevant triggers — savings_streak, eod_streak,
  spending_streak — to avoid heavy work).
- On debt-strategy updates (debt_bracket_cross only).

Triggers are deterministic. No clock skew, no randomness. Pinned
by `backend/test/rewards-trigger.spec.ts` against fixtures.

### 5.5 Claim flow

1. Trigger fires. `RewardClaim` is created in `unlocked` state.
   Funding pool reserves `credit_cents`.
2. Client gets an in-app banner: "Reward unlocked: '$title'.
   Credit: $X. Redeemable against $offer. By $coach. Education
   only — not a prize, not a yield. [Open]".
3. Client opens the reward; sees the verbatim disclaimers and
   claim button.
4. Claim does **not** transfer money; it creates a redemption
   token bound to the eligible offer set.
5. At checkout for an eligible offer, the redemption token is
   applied as a discount (server-side). `RewardClaim.redeemed_at`
   set.
6. On expiry: `RewardClaim` → `expired`; the funding pool releases
   its reservation.

Cash-equivalent reward → tax disclaimer surfaced once, at claim
unlock, never again. A 1099 / T4 shape is **not** in scope for v1
(rewards capped low enough to stay below thresholds; see §10).

### 5.6 API sketch

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/coach/rewards` | coach | Create reward; reserves from funding pool. |
| GET | `/api/coach/rewards` | coach | List own rewards. |
| POST | `/api/coach/rewards/:id/pause` | coach | Pause. |
| POST | `/api/coach/rewards/:id/retire` | coach | Retire (no new claims). |
| GET | `/api/rewards/me` | client | Available + unlocked + history. |
| POST | `/api/rewards/:id/claim` | client | Claim an unlocked reward (server-side, no money moves). |
| GET | `/api/admin/rewards/pools` | OWNER | All pools, balances, reservations. |
| POST | `/api/admin/rewards/:id/cancel` | OWNER | Force-cancel (refund reservation). |

## 6. HOW (the runtime PR shape)

PR-FS-9 ships:

1. The four schemas.
2. `backend/src/rewards/` module + trigger evaluator (cron + EOD
   webhook hooks).
3. Mobile screens.
4. Outcome-filter on title + description.
5. Claim flow + redemption token plumbed through PR-FS-3 checkout.
6. Pin: rewards-compliance, rewards-trigger.

## 7. Privacy & security

- Reward audience uses **bucketed** audiences (`all_l1`, `coach_roster`,
  `cohort`); never individually targeted reward (which would be
  approachable as discriminatory practice in some jurisdictions).
- Reward title + description go through the same filter.
- `RewardClaim` is private to the client + the funder (audited).
- GDPR scrub: deleted client's claims are anonymised; the funding-
  pool ledger keeps the reservation history.
- Funding-pool balance is not displayed publicly; a coach sees
  their own pool only.

## 8. Abuse & moderation

- A reward with `credit_cents > 5000` (configurable; default $50)
  requires OWNER approval before going active.
- Per-coach per-month reward funding cap (default $1,000).
- A coach cannot fund a reward whose redemption is *another
  coach's* offer (must be self or platform).
- Filter trip on title or description blocks publish.
- Reward shape audit: a checker reviews every new trigger kind
  before it is added (schema migration); kind list is closed.
- A reward with a tiny audience (e.g. one client) is rejected at
  creation (`audience` is bucketed; per-client targeting is not
  supported).

## 9. Disclaimers (verbatim)

- On every reward card and reward claim screen, full text:
  "Rewards recognise behaviour you complete using the app. They
  are not investment returns, prizes, or gambling outcomes. The
  trigger and the credit are set in advance by the funder; there
  is no random draw. Where the reward has a cash-equivalent value,
  your coach (or The Growth Project) funds it directly; tax
  treatment is your responsibility."
- On claim: an additional line:
  "Claiming this reward creates a discount token bound to a
  specific offer set. The Growth Project does not transfer cash."
- On a coach's funding pool view:
  "You fund this pool out of your own funds; the platform does
  not match contributions. Unused balance is refundable while no
  reward is reserved against it."

## 10. Feature flags & entitlements

| Flag | Default | Notes |
|---|---|---|
| `REWARDS_ENABLED` | off | global. |
| `coach_profiles.rewards_enabled` | off | per-coach. |
| `REWARDS_PLATFORM_FUNDED_ENABLED` | off | platform-funded shape. |
| `REWARDS_CREDIT_CAP_CENTS` | 5000 | per-reward cap; OWNER override. |
| `REWARDS_COACH_MONTHLY_CAP_CENTS` | 100000 | per-coach monthly fund cap. |

| Capability | client | coach | coach_premium | OWNER |
|---|---|---|---|---|
| Receive a reward | ✓ | n/a | n/a | n/a |
| Fund a reward | n/a | ✓ | ✓ | n/a |
| Fund > $50 cap | n/a | ✗ | requires OWNER approval | ✓ |
| Force-cancel | n/a | n/a | n/a | ✓ |

## 11. Analytics

| Event | Properties |
|---|---|
| `reward_created` | reward_id, trigger, credit_cents, audience |
| `reward_unlocked` | reward_id, claim_id |
| `reward_claimed` | claim_id |
| `reward_redeemed` | claim_id, order_id |
| `reward_expired` | claim_id |
| `reward_cancelled` | reward_id, actor |
| `reward_filter_blocked` | reward_id, field |
| `reward_pool_funded` | pool_id, amount_cents |
| `reward_pool_refunded` | pool_id, amount_cents |

## 12. Rollout

- Stage 0: spec.
- Stage 1: PR-FS-9 ships with `REWARDS_ENABLED=false`. Internal QA.
- Stage 2: 3 coaches, $50 cap, savings_streak only.
- Stage 3: 25 coaches; remaining triggers added one-at-a-time;
  retired triggers visible in the closed-list UI as "Retired".
- Stage 4: GA.

Kill switch: `REWARDS_ENABLED=false` returns 503 from
`/api/rewards/*`; existing unlocked claims remain redeemable
unless `REWARDS_KILL` is also flipped.

## 13. Tests

- `backend/test/rewards-compliance.spec.ts`:
  - Trigger kinds are an allow-list; new kind without schema is
    rejected.
  - Title / description filter pins; "win", "prize", "lucky",
    "lottery", "yield", "earn $", "guaranteed" all blocked.
  - No randomness in trigger evaluator (fixture pin).
- `backend/test/rewards-trigger.spec.ts`:
  - Each trigger evaluator is deterministic on fixtures.
  - Idempotency: re-running on same state does not double-unlock.
- `backend/test/rewards-pool.spec.ts`:
  - Pool reservation released on cancel / expire.
  - Coach cannot fund a reward redeeming another coach's offer.
- `mobile/test/rewards-screen.spec.tsx`:
  - All disclaimers verbatim.
  - No "win"-shaped UI.

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| A reward looks like a yield. | Outcome filter blocks "yield", "earn N%", "interest"; closed trigger list. |
| A reward looks like a prize. | Outcome filter blocks "win", "prize"; bucketed audiences only; no per-client targeting. |
| A reward looks like gambling. | No randomness in trigger; closed list; fixed credit per reward. |
| Tax exposure for high-value rewards. | Per-reward cap $50; per-coach monthly cap $1,000; OWNER approval above. |
| Coach uses rewards as a sales discount channel. | This is *intended* but capped: rewards are tied to a *behavioural* trigger, not "buy this and get $X off"; ranker for rewards is policy-only. |
| Trigger evaluator double-unlocks. | Idempotency key on `(reward_id, client_id)`; pinned. |

## 15. Dependencies

- Existing EOD pipeline + Priority Waterfall + WVS + Debt
  strategies modules.
- PR-FS-3 (billing) for redemption-token application.
- PR #120 lane #04 (data lifecycle) for retention of claim
  history.

## 16. Acceptance criteria

- [ ] Schemas migrated additively.
- [ ] Closed trigger list pinned; new kinds = schema migration.
- [ ] Outcome filter pinned with the rewards-specific corpus
      ("win", "prize", "lucky", etc.).
- [ ] Pool reservation pinned.
- [ ] Per-coach monthly cap pinned.
- [ ] All disclaimers verbatim on every relevant screen.
- [ ] Tax disclosure shown at claim unlock.

## 17. Operator handoff

- Runbook: `runbook/rewards.md` — pool refund, force-cancel,
  trigger-kind add procedure, OWNER approval workflow for >$50
  rewards, kill-switch flip.
- Dashboard tiles: rewards funded / 30d, claims unlocked / 30d,
  redemption rate, expired rate.
- Alerts: trigger-evaluator failure (page); pool over-reservation
  (data integrity issue, page); filter-trip rate > 5% on titles
  (suggests filter drift).
