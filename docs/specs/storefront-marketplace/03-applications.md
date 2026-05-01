# 03 — Applications (gated programs, KYC-lite)

> **Status:** draft, documentation-only. Authorises runtime PR-FS-4 (applications).

## 1. WHY

A finance coach wants to charge serious money for a serious cohort.
A 1:1 program at $5k, an L2 cohort at $1.5k, an L3 mastermind at
$10k+ — these do not sell on a "Buy now" button. They need an
**application**, **screening**, **conditional approval**, **deposit
on approval**, and **balance on confirm or refund on rejection**.

The fitness side is going there in PR #122 (masterminds operating
model spec) — same shape, different vertical, same compliance
posture for everything except outcome claims (where finance is
strictly tighter). This spec defines the shared application
primitive for finance and the explicit deltas from the fitness
posture (no outcome promises in screening copy or rubric, no
income-based criteria phrased as a yield, KYC-lite that makes no
KYC promise).

The one-line claim:

> A coach can publish an application-gated offer; a client can
> apply with a structured form; the coach can screen, decide,
> request a deposit, refund a deposit, or convert the deposit to
> the program balance — and at no step does the platform suggest
> it is a brokerage, a fiduciary, or that an outcome is promised.

## 2. WHEN

PR-FS-4 ships once:

- PR-FS-2 (offer catalogue) is merged so `application_gated` offers
  exist.
- PR-FS-3 (billing wiring) is merged so deposits can be taken.
- PR #122 (masterminds operating-model spec) is accepted in the
  fitness backend so the shared state machine
  (`INTERESTED → APPLIED → SCREENED → APPROVED → DEPOSIT_PAID →
  CONFIRMED`) is the one we extend in finance.
- A counsel-approved KYC-lite copy block is pinned (see §9).

## 3. WHERE

- `backend/prisma/schema.prisma` — `Application`,
  `ApplicationField`, `ApplicationDecision`, `ApplicationDeposit`.
- `backend/src/applications/` — module + README.
- `mobile/app/(applications)/` — apply screen, status screen,
  coach inbox screen.
- `backend/test/applications-state.spec.ts`.
- `backend/src/compliance/disclaimers.ts` — extended.

## 4. WHO

| Actor | Capability |
|---|---|
| Coach (Premium) | Create application-gated offers; configure form fields; screen and decide; convert deposit on confirm. |
| Coach (non-Premium) | Cannot create application-gated offers; can only see clients on their roster. |
| Client | Apply, attach EOD-derived qualification snapshot (opt-in), pay deposit on approval, accept or decline confirm step, request deposit refund within window. |
| OWNER | Read all applications (audited); refund any deposit; force-decision on coach inactivity. |
| Compliance | Spot-check application copy (form labels, decision message templates) for outcome-claim risk. |

## 5. WHAT

### 5.1 The application state machine (shared with PR #122)

```
DRAFT
  └─(client submits)──▶ APPLIED
                         └─(coach screens)──▶ SCREENED
                                                ├─(approve)──▶ APPROVED
                                                │              └─(deposit)──▶ DEPOSIT_PAID
                                                │                              └─(coach confirms or auto-confirm timeout)──▶ CONFIRMED
                                                └─(reject)──▶ REJECTED
APPROVED ──(no deposit in 7d)──▶ APPROVED_LAPSED
DEPOSIT_PAID ──(client requests refund within window)──▶ REFUNDED
CONFIRMED ──(client withdraws within cohort grace)──▶ WITHDRAWN
ANY ──(coach inactivity > 14d after APPLIED, OWNER force)──▶ REFUNDED
```

States are a closed enum. No skipping, no rewinding except via
OWNER override (which writes an audit row).

### 5.2 The application form

Form fields are declared per offer. Fixed schema:

```prisma
model ApplicationField {
  id             String   @id @default(cuid())
  offer_id       String
  order          Int
  kind           FieldKind
  label          String   @db.VarChar(120)
  required       Boolean  @default(false)
  options        Json?    // for select / checklist
  max_chars      Int?
  filter_strict  Boolean  @default(true)  // run outcome-claim filter
}

enum FieldKind { short_text long_text select checklist date number toggle attach_eod_snapshot }
```

`attach_eod_snapshot` is the privacy-preserving qualification:
client opts in; we attach a *bucketed* derived view of their EOD-
derived metrics (savings rate band, debt-to-income band, streak
length, current Wealth Velocity Score level — *never raw amounts*).
This is the consumer-finance KYC-lite: enough for the coach to
screen, not enough to be a KYC promise. Pinned by
`backend/test/applications-snapshot.spec.ts` to never include raw
balances or institution names.

### 5.3 Application object

```prisma
model Application {
  id                  String              @id @default(cuid())
  client_id           String
  coach_id            String
  offer_id            String
  state               ApplicationState
  responses           Json                // { field_id: value }
  qualification_snapshot Json?            // bucketed; opt-in
  deposit_id          String?             @unique
  decided_by          String?             // coach or OWNER user id
  decided_at          DateTime?
  decision_note       String?             @db.VarChar(2000)
  filter_blocked_at   DateTime?
  cohort_id           String?             // resolves on CONFIRMED
  created_at          DateTime            @default(now())
  updated_at          DateTime            @updatedAt
}

enum ApplicationState {
  DRAFT APPLIED SCREENED APPROVED APPROVED_LAPSED DEPOSIT_PAID
  CONFIRMED REFUNDED REJECTED WITHDRAWN
}
```

### 5.4 API sketch

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/applications` | client | Create (DRAFT). |
| PATCH | `/api/applications/:id` | client (own) | Save responses. |
| POST | `/api/applications/:id/submit` | client (own) | DRAFT → APPLIED. |
| GET | `/api/applications/me` | client | List own applications. |
| GET | `/api/coach/applications` | coach | Inbox (paginated, filterable by state). |
| POST | `/api/coach/applications/:id/screen` | coach | APPLIED → SCREENED + note. |
| POST | `/api/coach/applications/:id/approve` | coach | SCREENED → APPROVED + decision_note. |
| POST | `/api/coach/applications/:id/reject` | coach | SCREENED → REJECTED + decision_note (filtered). |
| POST | `/api/applications/:id/deposit` | client (own + APPROVED) | Initiate deposit checkout. |
| POST | `/api/coach/applications/:id/confirm` | coach | DEPOSIT_PAID → CONFIRMED, attach to cohort. |
| POST | `/api/applications/:id/withdraw` | client (own) | If permitted by grace policy. |
| POST | `/api/coach/applications/:id/refund_deposit` | coach OR OWNER | Refund. |
| GET | `/api/admin/applications/inactive` | OWNER | Inactivity tray. |

Throttling: 5 applications / 24h / client (anti-spam); coach
decision endpoints: 50 / hour.

### 5.5 Screens & navigation

- **Client `(applications)/apply/[offerId].tsx`** —
  - Top: offer summary, "Apply" headline, education-only disclaimer.
  - Form, field-by-field, with a small "Save draft" affordance.
  - `attach_eod_snapshot` is a separate consent step, with its own
    "What is shared" line that lists exactly what bands are
    attached. The opt-in is rejectable; rejection does not block
    submission unless the coach marked the field required.
  - Submit → "Submitted" page with a progress strip:
    `Submitted → Reviewed → Decided`.
- **Client `(applications)/me.tsx`** — list of own applications,
  state, decided-by, decision-note (if rejected), CTA buttons
  appropriate to state.
- **Coach `(applications)/inbox.tsx`** — split-pane (or tabbed on
  small screens):
  - List: filter by state, sort by submitted-at.
  - Detail: form responses, qualification snapshot (bucketed),
    decision controls (Screen / Approve / Reject / Refund / Force-
    confirm), audit trail.
- **Approval result** — when client approved, banner + email:
  "Your application is approved. Pay the deposit to hold your
  spot." with a 7-day timer.
- **Deposit screen** — reuses `(checkout)` flow; offer kind is
  resolved server-side; deposit amount comes from `Offer.deposit_cents`.
- **Confirm step** — once deposit is paid, a coach action moves to
  CONFIRMED (or auto-confirm after 48h). Confirm reveals cohort
  start, Slack/space link, etc.

## 6. HOW (the runtime PR shape)

PR-FS-4 ships:

1. The four schemas (`Application`, `ApplicationField`,
   `ApplicationDecision`, `ApplicationDeposit`).
2. The state machine module + tests.
3. Coach inbox + client apply screens.
4. Reuse PR-FS-3 checkout for deposit.
5. Email templates: applied receipt, decision (approved /
   rejected), deposit receipt, confirm.
6. Module README.
7. Pin: applications-state, applications-snapshot, applications-
   doctrine.

## 7. Privacy & security

- **Tenant**: `client_id` and `coach_id` on every application. A
  coach cannot read another coach's applications.
- **Snapshot**: bucketed only. Never raw balances. Never institution
  names. Never transaction lines. The exact bands are an allow-list
  from `backend/src/insights/bands.ts` (already exists for the
  insights pipeline) and pinned.
- **Decision-note filter**: the rejection note runs through the
  outcome-claim filter (a coach cannot reject by writing "you don't
  have enough income to hit the $50k goal"). Filter trip queues
  the rejection for OWNER review and notifies the coach.
- **PII in responses**: form responses are end-to-end on the
  platform; nothing leaves to a third party. GDPR scrub covers
  `Application.responses` and `qualification_snapshot`.
- **Audit**: every state transition is audited; every coach action
  is audited; every OWNER override is audited.
- **Withdraw + refund grace**: the deposit is fully refundable
  *before* APPROVED → DEPOSIT_PAID; in APPROVED state, refund is
  always possible; in DEPOSIT_PAID, refund is per offer policy
  (default 7 days fully refundable); in CONFIRMED, the offer's
  `RefundPolicy` governs.

## 8. Abuse & moderation

- Outcome filter on coach decision-notes (approve + reject).
- Outcome filter on form `label` text at offer authorship time.
- Per-client throttle on application creation: 5 / 24h.
- Per-coach review SLA: APPLIED → SCREENED in ≤ 14 days; OWNER
  inactivity tray pages OWNER if > 14d. Auto-refund + force-reject
  with the "Coach was inactive; deposit refunded" decision-note
  if > 30d.
- Coach cannot approve their own family relations: enforced
  weakly via flagged-domain emails (we do not own this signal
  fully; this is a coach-policy reminder).

## 9. Disclaimers (verbatim)

- Top of apply screen:
  "This application is a screening step only. The Growth Project
  does not guarantee approval, an outcome, or a financial result.
  Your coach makes the decision; the platform handles the form,
  the deposit, and the receipt."
- Above `attach_eod_snapshot` consent toggle:
  "Sharing your snapshot attaches a *banded* view of your savings
  rate, debt-to-income, streak, and Wealth Velocity Score level —
  not raw amounts. You can decline."
- Above deposit button (reuses `purchase_terms` + extra):
  "Your deposit is fully refundable until your application is
  decided. After approval, refunds follow the offer's stated
  policy."
- On rejection result:
  "Your application was not accepted. Your coach has provided a
  note. The Growth Project does not guarantee acceptance into any
  program."

## 10. Feature flags & entitlements

| Flag | Default | Notes |
|---|---|---|
| `APPLICATIONS_ENABLED` | off | global. |
| `coach_profiles.applications_enabled` | off | coach Premium gate. |
| `APPLICATIONS_SNAPSHOT_ENABLED` | off | sub-flag for the EOD snapshot field; OFF by default until snapshot bands pinned. |

| Capability | L1 | L2 | L3 | coach | coach_premium | OWNER |
|---|---|---|---|---|---|---|
| Apply to a gated offer | ✓ | ✓ | ✓ | n/a | n/a | n/a |
| Withdraw after CONFIRMED | per policy | per policy | per policy | n/a | n/a | force |
| Create a gated offer | n/a | n/a | n/a | ✗ | ✓ | n/a |
| Screen & decide own offers | n/a | n/a | n/a | ✗ | ✓ | n/a |
| Force-refund any deposit | n/a | n/a | n/a | ✗ | ✗ | ✓ |

## 11. Analytics

| Event | Where | Properties |
|---|---|---|
| `application_started` | DRAFT created | offer_id, coach_id |
| `application_submitted` | APPLIED | offer_id, coach_id |
| `application_screened` | SCREENED | offer_id, coach_id, time_in_applied_h |
| `application_decided` | APPROVED/REJECTED | decision, time_to_decide_h |
| `deposit_paid` | DEPOSIT_PAID | amount_cents, offer_id |
| `application_confirmed` | CONFIRMED | offer_id, cohort_id |
| `application_refunded` | REFUNDED | actor, reason |
| `application_filter_blocked` | filter trips | field, matched |

## 12. Rollout

- Stage 0: this spec.
- Stage 1: PR-FS-4 ships with `APPLICATIONS_ENABLED=false`.
- Stage 2: enabled for 3 OWNER-selected `coach_premium` accounts
  with one cohort each ≤ $1k deposit.
- Stage 3: 10 cohorts, deposit cap $5k.
- Stage 4: GA.

Kill switch: `APPLICATIONS_ENABLED=false` returns 503 from
`/api/applications/*`; in-flight applications stay in their
current state and the inbox is read-only.

## 13. Tests

- `backend/test/applications-state.spec.ts`:
  - All transitions match §5.1; illegal transitions return
    `409 STATE_TRANSITION_INVALID`.
  - Coach inactivity timer: APPLIED > 14d pages OWNER; > 30d
    auto-refunds.
  - APPROVED > 7d → APPROVED_LAPSED.
- `backend/test/applications-snapshot.spec.ts`:
  - Snapshot is bucketed; never contains raw amounts or institution
    names; pinning corpus.
- `backend/test/applications-doctrine.spec.ts`:
  - Outcome-claim filter on `decision_note` and `label`.
- `mobile/test/apply-screen.spec.tsx`:
  - All disclaimers verbatim.
  - `attach_eod_snapshot` consent surface lists exactly what is
    attached.

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Coach inactivity strands deposits. | OWNER inactivity tray; auto-refund at 30d. |
| Snapshot leaks raw money. | Pinned snapshot allow-list; doctrine spec. |
| Rejected client sues over decision note. | Filter on note; OWNER review on filter trip. |
| Application rebound (client applies repeatedly). | Per-client throttle. |
| Coach over-promises in approval message. | Filter on approval note; same posture. |

## 15. Dependencies

- PR-FS-2 (offers).
- PR-FS-3 (billing).
- PR #122 (masterminds operating model) — application state
  machine.
- PR #120 lane #04 (data lifecycle) — GDPR scrub extension.
- `backend/src/insights/bands.ts` (existing).

## 16. Acceptance criteria

- [ ] Schema migrated additively.
- [ ] State machine spec passes.
- [ ] Snapshot allow-list pinned.
- [ ] All disclaimers verbatim on every relevant screen.
- [ ] Coach inactivity tray paged OWNER on the 14d/30d signals.
- [ ] Refund pathways pinned for every state.

## 17. Operator handoff

- Runbook: `runbook/applications.md` covers inactivity-tray triage,
  forced refund, OWNER override.
- Dashboard tile: applications by state; median time-to-decision;
  inactivity-tray depth.
- Alerts: inactivity > 14d (page); approval rate < 5% over 30d
  (FYI, suggests offer mismatch); rejection-note filter trips.
