# Assignments — the shared primitive

> **Closest existing module:** there isn't one. This document describes
> a primitive that the three module specs (`01-challenges.md`,
> `04-content-boards.md`, `05-regimens.md`) all rely on. The doc exists
> so the reader has one place to see the shared vocabulary; the
> implementation **does not** carve out a separate `assignments` module.

## 1. Why

Three module specs each describe an "assignment": challenge to
client, content to client, regimen to client. They share five
properties:

- a coach is the assignor,
- a student is the assignee,
- the assigned artefact is coach-scoped,
- the assignment moves through `pending → active → complete |
  abandoned | rescinded`,
- coach actions and EOD-derived progress emit auditable events.

We could carve a `assignments` table out and make every module write
through it. We deliberately do not. Reasons:

1. **Polymorphism on a relational shape is painful.** A unified
   `assignments` table with a `kind` column and three nullable FKs
   (`challenge_id`, `content_id`, `program_id`) is a worst-of-both
   world: the queries require kind-aware branching anyway.
2. **The three artefacts have different progress models.**
   Challenges have a numeric score, content has open events,
   regimens have a phase ordinal. A single "progress" column
   either takes a `Json` or a discriminated set of columns —
   neither is cleaner than three tables.
3. **The owner / federation surface composes them externally.**
   The unified admin console needs "what is this client doing
   across all three?" — a cross-table union, computed at read
   time, not denormalised in writes.

So the "shared primitive" is **a contract**, not a table. This doc
captures the contract; each module's spec implements it.

## 2. The contract

Every assignment-shaped row across the three modules MUST satisfy
all of:

### 2.1 Columns (or their equivalents)

- `student_id` — UUID, FK to `users`. The assignee.
- `coach_id` — derivable. Either an explicit column or via the
  parent artefact's `coach_id`.
- `state` — one of `pending | active | complete | abandoned |
  rescinded`. Each artefact's spec MAY constrain the legal subset
  (e.g. content has no `complete` state — it has `opened` instead;
  see §3 below for the reconciliation).
- `state_history` — `Json` array of `{ state, changed_at,
  changed_by, source, note }` rows, append-only.
- `created_at`, `updated_at`.

### 2.2 Lifecycle invariants

- **Tenancy.** Every assignment row has its tenancy boundary at
  `coach_id` (derived or explicit). A coach reads their own
  assignments only; owner has explicit bypass.
- **Single source for state changes.** The state column is the
  single source of truth. The `state_history` is appended on
  every transition; the column is never updated without a history
  entry in the same transaction.
- **Idempotent re-derivation.** Where state is derived (EOD
  hooks, time-based transitions to `abandoned`), re-running the
  derivation for the same input window does not produce duplicate
  history entries.
- **Reversible by coach.** A coach can rescind any assignment.
  Rescind is final; a rescinded assignment is **not** re-activated
  (the coach assigns again, creating a new row).
- **Owner-only hard delete.** Soft delete is rescind / archive.
  Hard delete is the owner moderation path (`/api/admin/.../takedown`).

### 2.3 Auditability

- Every state transition writes a `state_history` entry. The entry
  documents `changed_by` (user id) and `source` (`'coach'`,
  `'eod_pipeline'`, `'system'`, `'owner'`). When the source is
  `coach`, the `changed_by` is the coach's id; when `eod_pipeline`,
  it is the student's id (the EOD submitter).
- Each module emits one of a fixed event vocabulary: see §4.

### 2.4 Authorisation

- Coach mutations require `RoleGuard('coach') + Owns<Artefact>Guard`.
- Student reads require `EntitlementGuard(<artefact>)`.
- Owner reads + mutations bypass via the existing role short-circuit.

### 2.5 No cross-coach refs

An assignment's parent artefact (challenge / content item /
regimen) MUST belong to the same `coach_id` as the assignment.
This is enforced at write time in each module's service.

## 3. Reconciliation across the three modules

Each module reuses the contract with a small per-module shape:

| Property | Challenge | Content | Regimen |
|---|---|---|---|
| Row name | `ChallengeAssignment` | `ContentAssignment` | `ProgramAssignment` |
| Parent FK | `challenge_id` | `content_id` | `program_id, program_version` |
| State subset | `pending, active, complete, abandoned, rescinded` | `pending, opened, rescinded` | `pending, active, complete, abandoned, rescinded` |
| Progress shape | `current_score` (int) + `events[]` | `opened_at` + `open_events[]` | `current_phase_ordinal` + `events[]` |
| EOD hook? | yes (score derivation) | no | yes (phase advance) |

Content has a degenerate state model — there's no "active" phase
beyond "first open". We map content's `opened` state to the
shared vocabulary as a synonym for `complete` for cross-artefact
reporting (the unified admin console treats `opened` as a
completion). The DTO returned to the client carries the
artefact-native state name; the federation surface normalises.

## 4. The event vocabulary

A single, audit-friendly enum across all three modules:

```ts
// src/common/assignment-events.ts (implementation PR)
export type AssignmentEventKind =
  | 'created'
  | 'activated'
  | 'progress'         // EOD-derived score / open / phase event
  | 'phase_advanced'   // regimens only
  | 'phase_back'       // regimens only — coach can step back
  | 'completed'
  | 'opened'           // content only — synonym for completed
  | 'abandoned'
  | 'rescinded'
  | 'migrated_version' // regimens only
;

export type AssignmentEventSource = 'coach' | 'eod_pipeline' | 'system' | 'owner';
```

This vocabulary is the **single shape** the federation surface
exposes when the unified admin console queries
`/api/admin/federation/coach/:email/assignments`. The federation
endpoint (proposed in `00-overview.md` §6.3) flattens every
artefact's per-row events into this stream so the console renders a
single timeline per client.

## 5. The federation read

```
GET /api/admin/federation/coach/:email/assignments?since=<ISO>
Auth: FEDERATION_SERVICE_TOKEN bearer
```

Returns:

```jsonc
{
  "identityMapping": "email",
  "since": "2026-04-01T00:00:00Z",
  "events": [
    {
      "student_email": "alex@example.com",
      "kind": "challenge",
      "artefact_id": "uuid",
      "artefact_title": "60-Day No-Spend Sundays",
      "event": "progress",
      "delta": 12,
      "source": "eod_pipeline",
      "created_at": "2026-04-15T03:18:21Z"
    },
    // ... including content + regimen events ...
  ]
}
```

Same `503 FEDERATION_DISABLED` / `401 FEDERATION_UNAUTHENTICATED`
semantics as the existing federation surface
(`backend/src/admin/README.md`).

## 6. Tests

A single doctrine-pin spec covers the shared contract:

`test/assignments-contract.spec.ts`:

- Every assignment table has `student_id`, `state`, `state_history`,
  `created_at`, `updated_at` (introspect via Prisma DMMF).
- The legal-states subset for each table is documented and
  enforced.
- The federation event surface emits the canonical vocabulary;
  no per-module synonyms leak.

This test is the "if you add a fourth assignment-shaped artefact,
you must satisfy the contract" gate.

## 7. Risks

1. **Drift between modules' state machines.** Regimen adds
   `phase_back`, content doesn't have `active`. **Response:** the
   contract spec + the introspection test are the gate.
2. **A future need for `transferred` (re-assigning to a different
   client).** Out of scope for v1; documented here so a future
   PR knows where to land it.
3. **Cross-artefact analytics requires a UNION.** The unified
   admin console pays the cost. We accept it; the alternative is a
   denormalised assignments table that the §1 reasoning rejects.
