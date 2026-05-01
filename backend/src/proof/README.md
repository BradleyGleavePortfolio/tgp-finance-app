# Proof runtime

Auditable scaffolding for verified-progress proof: net worth milestones,
finance/income/bank documents, fitness metrics with coach signoff, login
streak / habit consistency, coach reports, admin reports, milestone
reviews, and self-reports. Built so a future TGP Brain can read and
summarise proof without ever being on the privileged write path.

## Audience and intent

First buyer is **internal TGP Coaching clients**, then **personal trainers
and hybrid coach operators**. The trust model below is calibrated for that
audience: a coach signs off on student progress, an admin sits one tier
above for disputes and high-value claims, the student is the subject but
not the authority on their own record.

## Trust model

```
   submitted_at          reviewed_at
       |                       |
       v                       v
 [pending_review] --(coach)--> [coach_signed_off]   ← authoritative
                  --(coach)--> [coach_rejected]
                  --(admin)--> [admin_reviewed]     ← authoritative
                  --(any)----> [disputed]
                  --(coach/admin)--> [flagged_abuse]  ← blocks downstream
                  --(system)--> [stale]              ← non-authoritative
                  --(replace)--> [superseded]        ← non-authoritative
```

Two status sets the rest of the codebase consumes via
`proof.service.ts`:

- `AUTHORITATIVE_STATUSES` — what client-facing aggregates and the AI
  summariser may treat as ground truth.
- `NON_AUTHORITATIVE_STATUSES` — everything else. Pending, rejected,
  disputed, flagged for abuse, stale, superseded.

## Tables

| Table              | Purpose                                                |
|--------------------|--------------------------------------------------------|
| `proof_artifacts`  | One artifact = one piece of evidence backing a claim. |
| `proof_signoffs`   | Append-only reviewer decisions (coach, admin).         |
| `proof_audit_logs` | Append-only audit stream. Every state change lands here. |
| `proof_ai_drafts`  | AI-generated *advisory* notes. Never authoritative.    |

The Prisma schema lives in `backend/prisma/schema.prisma`; the migration
SQL is `backend/prisma/migrations/20260503000000_proof_runtime_scaffolding/`.

## Money handling

Every monetary field on a proof artifact (`claimed_amount`, `corrected_amount`)
flows through the shared `MoneyAmount*` Zod schemas in
`src/common/zod/money.ts` per `backend/docs/MONEY.md`. Stored as
`DECIMAL(14, 2)`, surfaced as `number` to the wire by the existing
`DecimalToNumberInterceptor`.

## What the AI may and may not do

`proof-ai.service.ts` enforces hard rules. AI may:

- Read artifacts and produce a summary.
- Flag missing or stale data.
- Flag contradictions (e.g. two different `claimed_amount`s on the same
  `kind` + `occurred_at`).
- Draft a coach/admin note text.

AI may **not**:

- Mutate `ProofArtifact.status`, write a `ProofSignoff`, or change any
  money field.
- Provide investment advice. The guard rejects drafts whose text matches
  the prescriptive-advice phrase list in
  `proof-ai.service.ts#FORBIDDEN_PHRASES`.
- Trigger payouts, notifications, or external side-effects.

Acceptance of an AI draft routes through `ProofService.signoff` — the
human reviewer is the authoritative actor, not the AI.

## Live vs scaffolded

This PR ships **scaffolding**: the schema, contracts, services, controller,
audit trail, guardrail surface, and tests. It is not yet wired into a
client surface and the AI side does not call a model. Specifically:

| Surface                                  | State        |
|------------------------------------------|--------------|
| Prisma schema + migration SQL            | live (not auto-applied) |
| `ProofService.submit / signoff / flag`   | live, route-mounted at `/api/proof` |
| Zod contracts + validation               | live, tested |
| Staleness sweep (`markStaleArtifacts`)   | live, no cron yet |
| `ProofAIService.persistDraft` guardrails | live, tested |
| Actual model call producing draft text   | scaffolded — caller passes precomputed text |
| Mobile UI for submitting / reviewing     | not in this PR |
| Coach + admin role guard at HTTP layer   | service-level checks only — see comment in `proof.controller.ts` |
| Multi-currency aggregates                | not supported; `currency` defaults to USD |
| Object storage for `user_upload`         | the contract validates `storage_ref + sha256 + byte_size`, but the upload pipeline isn't wired |

## Endpoints

All under `/api/proof`, behind `JwtAuthGuard`:

| Method | Path                       | Notes |
|--------|----------------------------|-------|
| POST   | `/api/proof`               | Submit an artifact. Body validated by `SubmitProofSchema`. |
| GET    | `/api/proof/mine`          | List the caller's own artifacts. |
| GET    | `/api/proof/queue`         | Coach: own pending queue. Admin/owner: pass `?all=1` for all. |
| GET    | `/api/proof/:id`           | Artifact + signoffs + audit log + AI drafts. |
| POST   | `/api/proof/:id/signoff`   | Coach/admin/owner only. |
| POST   | `/api/proof/:id/abuse-flag`| Coach/admin/owner only. |
| POST   | `/api/proof/:id/correct-amount` | Coach/admin/owner only. |

## Tests

`backend/test/proof.contracts.spec.ts` locks the Zod contracts: kind/amount
cross-rules, source metadata shapes, currency format, dispute reason
required, https-only external links.

`backend/test/proof-ai-guardrails.spec.ts` locks the AI guardrails:
forbidden-phrase rejection, draft-kind allowlist, blocked drafting against
`flagged_abuse` artifacts, contradiction detection, context builder
authoritative-count math.

## Open questions for the next phase

- Cron wiring for the staleness sweep (where should it live — `SystemModule`
  scheduler or its own job?).
- Object-storage backend for `user_upload` (Supabase Storage vs S3) and the
  signed-URL surface that returns the artifact to a coach reviewer.
- Multi-currency aggregation rules — today the service rejects nothing, but
  the coach summary code should not sum across currencies.
- Coach/admin role guard at the HTTP layer (`ProofRoleGuard`) so 403s come
  back at the boundary, not from the service.
- Identity bridge to the fitness backend so `fitness_metric` artifacts can
  reference verified fitness records via `external_link`.
