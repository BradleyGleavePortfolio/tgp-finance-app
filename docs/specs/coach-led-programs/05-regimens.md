# Finance Regimens — multi-phase programs

> **Closest existing module:** `backend/src/coach/` — specifically the
> `ProgramTemplate` model and `applyTemplate` flow. This document
> proposes promoting that lightweight construct into a first-class
> module with phases, assignments, audit, and progress.

## 1. Why

A regimen is to a challenge as a coaching season is to a workout: a
multi-week, multi-phase plan a coach authors once and runs against
many clients with per-client adjustments. The fitness app has them
("8-week strength regimen", "12-week marathon block"). Finance has
them too, but coaches today encode them as a `ProgramTemplate` row —
a `Json` blob of phases applied via a single endpoint that bumps the
client's priority index and writes a coach note. That is fine for
the founder cohort and breaks the moment a coach wants to:

- run the same regimen against a fresh cohort (audit trail per
  application is a coach note, not a structured row),
- adjust a regimen mid-cohort and have running clients get the
  adjustment without re-applying,
- deliver content (`04-content-boards.md`) attached to a phase,
- run challenges (`01-challenges.md`) attached to a phase,
- see "where in the regimen is each client right now?" without
  reading per-client notes.

The most common finance regimens we see, in priority order:

- **Debt avalanche / snowball, 90-day.** Phase 1: cash floor,
  Phase 2: minimums everywhere, Phase 3: aggressive top-line.
- **Cash floor rebuild, 60-day.** Three sinking-fund pulses.
- **Sinking-fund regimen, 12-week.** A category per week, building
  toward 12 envelopes.
- **High-yield savings + Roth IRA setup, 30-day.** Mostly content,
  one challenge.
- **Spending audit, 14-day.** Daily category review challenge plus
  a Spending DNA-style narrative.
- **Pre-retirement glidepath, 6-month.** Quarterly coach reviews,
  monthly content drops.

Each is a sequence of phases; each phase has a duration, a
behavioural prompt (the priority-waterfall index it advances to),
optional challenges, optional content. None of them prescribe a
specific financial product; that line is enforced by `09-compliance.md`.

## 2. When

Regimen lifecycle (per `00-overview.md` §5): `drafted → published →
assigned → archived → removed`. Assignment lifecycle: `pending →
active → complete | abandoned | rescinded`.

A regimen is **versioned** from publish forward. Editing a published
regimen creates a new version; assignments pinned to the old version
keep their phase order. The coach can opt to "migrate active
assignments" to the new version (a per-phase migration that respects
where the client is); by default, edits don't ripple.

When the client sees what:

- **On assignment** — the regimen appears on their home tab
  ("priorities" section gains a "Programs" header). A push gated by
  `coach_messages` pref.
- **Phase advance** — auto-advance on EOD (when the priority
  waterfall computes a level change) or manual coach advance from
  the coach detail surface.
- **Phase complete** — the auto-generated coach note documents the
  transition. A new content drop attached to the next phase becomes
  visible.
- **Regimen complete** — final coach note + a milestone-style
  unlock (no confetti, mirrors `mobile/DESIGN.md`).

## 3. Where

- **Backend module:** new `backend/src/programs/`. The legacy
  `ProgramTemplate` model is **migrated** to the new `Program` shape
  (and kept alive as a Prisma model with a deprecation comment for
  one release cycle, so any in-flight references in the seed +
  scripts continue to work).
- **Schema:** `Program`, `ProgramPhase`, `ProgramAssignment`,
  `ProgramAssignmentEvent`. The legacy `ProgramTemplate` rows are
  data-migrated into `Program` rows with a single phase.
- **Mobile:**
  - `mobile/app/programs/index.tsx` — student list.
  - `mobile/app/programs/[id].tsx` — student detail (phases,
    current week, attached content + challenges).
  - `mobile/app/coach/programs/index.tsx` — coach own list.
  - `mobile/app/coach/programs/[id].tsx` — coach detail + roster
    progress.
  - `mobile/app/coach/programs/new.tsx` — coach authoring.

## 4. Who

- **Author / publish / archive:** coach (or owner).
- **Assign:** coach (or owner). Coach scoped; owner cross-tenant.
- **Read assigned regimen:** the assigned client.
- **Read coach's own:** the coach.
- **L1 clients:** no programs surface (`403 NOT_ENTITLED`).

## 5. What — data model

### 5.1 Schema

```prisma
enum RegimenState {
  draft
  published
  archived
  removed
}

enum AssignmentState {
  pending
  active
  complete
  abandoned
  rescinded
}

model Program {
  id              String    @id @default(uuid())
  coach_id        String
  coach           User      @relation(fields: [coach_id], references: [id])
  name            String
  description     String?   // markdown, sanitized; ≤ 4000 chars
  // Coach-authored "the why" — surfaced on the student detail.
  rationale       String?   // ≤ 1500 chars
  duration_weeks  Int       // 2..52
  // Required behavioural target as a priority index, optional —
  // `null` means the regimen does not promise a level change.
  target_priority_index Int?
  state           RegimenState @default(draft)
  // Version pin: monotonically increasing on every publish.
  version         Int       @default(1)
  published_at    DateTime?
  archived_at     DateTime?
  removed_at      DateTime?
  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt
  phases          ProgramPhase[]
  assignments     ProgramAssignment[]

  @@index([coach_id, state])
  @@map("programs")
}

model ProgramPhase {
  id            String   @id @default(uuid())
  program_id    String
  program       Program  @relation(fields: [program_id], references: [id], onDelete: Cascade)
  ordinal       Int      // 0-based
  name          String
  description   String?  // markdown; ≤ 2000 chars
  duration_weeks Int     // 1..16; sum across phases must equal program.duration_weeks
  // Optional: which priority index the phase ends at.
  ends_at_priority_index Int?
  // Optional content attachments (refs into ContentItem).
  // Authored at publish time; mutating these creates a new version.
  content_attachment_ids String[]
  challenge_attachment_ids String[]
  created_at    DateTime @default(now())
  updated_at    DateTime @updatedAt

  @@unique([program_id, ordinal])
  @@map("program_phases")
}

model ProgramAssignment {
  id              String          @id @default(uuid())
  program_id      String
  program         Program         @relation(fields: [program_id], references: [id])
  // Pin to the program version at assignment time.
  program_version Int
  student_id      String
  student         User            @relation(fields: [student_id], references: [id])
  starts_at       DateTime
  ends_at         DateTime        // computed = starts_at + duration_weeks
  // Current phase ordinal; advances with EOD priority changes or
  // explicit coach action.
  current_phase_ordinal Int      @default(0)
  state           AssignmentState @default(pending)
  state_history   Json            @default("[]")
  created_at      DateTime        @default(now())
  updated_at      DateTime        @updatedAt
  events          ProgramAssignmentEvent[]

  @@unique([program_id, student_id, program_version])
  @@index([student_id, state])
  @@map("program_assignments")
}

model ProgramAssignmentEvent {
  id            String   @id @default(uuid())
  assignment_id String
  assignment    ProgramAssignment @relation(fields: [assignment_id], references: [id], onDelete: Cascade)
  kind          String   // 'phase_advance' | 'phase_back' | 'complete' | 'abandon' | 'rescind' | 'migrate_version'
  from_phase    Int?
  to_phase      Int?
  source        String   // 'eod_pipeline' | 'coach' | 'system' | 'owner'
  note          String?
  created_at    DateTime @default(now())

  @@index([assignment_id, created_at])
  @@map("program_assignment_events")
}
```

The unique key on `ProgramAssignment` is
`(program_id, student_id, program_version)` — a client can be
assigned the same program twice if the program has been re-versioned
(treated as a fresh assignment), but cannot be assigned the same
version twice.

### 5.2 Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/coach/programs` | coach | Create draft. |
| PATCH | `/api/coach/programs/:id` | coach (owns) | Edit draft. After publish, edits create a new version. |
| POST | `/api/coach/programs/:id/publish` | coach (owns) | Validates phases sum to `duration_weeks`; bumps `version`. |
| POST | `/api/coach/programs/:id/archive` | coach (owns) | Soft-archive. |
| POST | `/api/coach/programs/:id/assign` | coach (owns) | `{ student_ids: [...], starts_at }`. |
| POST | `/api/coach/programs/assignments/:id/advance` | coach (owns) | Manual phase advance / back-step. |
| POST | `/api/coach/programs/assignments/:id/migrate-version` | coach (owns) | Migrate active assignment to current `version`, mapping ordinal where possible. |
| POST | `/api/coach/programs/assignments/:id/rescind` | coach (owns) | Soft-cancel; writes coach note. |
| GET | `/api/coach/programs` | coach | Coach's own. |
| GET | `/api/coach/programs/:id/roster` | coach (owns) | Per-phase counts of assigned clients. |
| GET | `/api/programs` | student (L2/L3) | Student's active + recent. |
| GET | `/api/programs/:assignment_id` | student (L2/L3) | Detail with phases, current ordinal, attachments. |

### 5.3 Phase-priority interplay

The existing priority waterfall (`mobile/app/(tabs)/index.tsx` and
`backend/src/priorities/`) computes a 0..6 priority index per
client. Programs interplay with it:

- `ProgramPhase.ends_at_priority_index` is the **expected** index
  the client should be at when this phase ends. If the index isn't
  there at the phase's expiry, the auto-advance does not fire; the
  coach is alerted via the existing alerts surface (extended in
  `07-messaging-progress.md`).
- The priority waterfall remains **the source of truth** for the
  client's level. Programs do not override it. A program is a
  *plan*, the waterfall is a *measurement*.

This decoupling is critical: it prevents the regimen surface from
silently misrepresenting a client's actual financial state.

### 5.4 Mobile UX

- **Student list** — a quiet card per active program. Title,
  current week ("week 4 of 12"), the current-phase title (single
  short line), a hairline progress bar (no oxblood until ≥80%
  complete; even then, the bar — not a percentage glyph — is the
  signal).
- **Student detail** — the phase list as a vertical stepper. The
  current phase is the only oxblood accent on screen. Past phases
  are stone-grey ticks. Future phases are bone outlines.
  Attached content + challenges hang under the current phase.
- **Coach detail** — phase-by-phase roster: how many clients are
  currently in phase 0, phase 1, etc. Click-through into per-client
  detail (existing surface). Edit + publish-new-version controls.
- **Authoring** — a phase builder. Add phase, name, duration,
  optional priority target, optional content + challenge
  attachments. Publish gates on the phase-duration sum equalling
  the program duration.

## 6. How — the implementation pattern

### 6.1 Versioning

- Editing a draft program is unconstrained.
- After publish, every `PATCH` increments `version`. The previous
  version's row is **not** preserved in a separate table; we
  rewrite the same `Program` row with the bumped version, and
  rely on `ProgramAssignment.program_version` to pin.
- This means the coach cannot read the old version of a program
  from the API. **Trade-off accepted:** a separate `ProgramVersion`
  table doubles the schema complexity for a feature that maybe
  five coaches will use ("show me what v1 of this program looked
  like"). We add it later if needed.

### 6.2 Phase advance

EOD pipeline (after `computeAndUpdateTotals`, after challenges
hook):

```ts
await this.programsService.maybeAdvancePhase(prisma, userId, profile.current_priority_index);
```

`maybeAdvancePhase` reads all `active` assignments for the user.
For each, it checks whether the current phase's
`ends_at_priority_index` has been hit; if so, advances to the next
ordinal and writes a `ProgramAssignmentEvent` of kind
`phase_advance`. If the assignment is on the final phase and
the program target is met, transitions to `complete`.

The hook lives inside the EOD transaction; rollback rolls back.

### 6.3 Authorization

- Mutations under `/api/coach/programs/*`: `JwtAuthGuard +
  RoleGuard('coach') + OwnsProgramGuard`. Service-level
  `assertCoachOwnsProgram` belt-and-braces.
- Student reads under `/api/programs/*`: `JwtAuthGuard +
  EntitlementGuard('programs')`.

### 6.4 Doctrine pin tests

`test/programs-doctrine.spec.ts`:

- The DTO returned to a student carries no `Decimal` field except
  the coach-authored target dollar amount inside attachments
  (which are challenges; their own pin tests apply).
- Auto-generated coach notes on advance / complete / rescind have
  no audience framing, no emoji.
- Phase-priority drift is **not** silently corrected — if the
  priority is below the phase's expected end, the assignment
  state stays `active` and the alert surface flags it.

`test/programs.service.spec.ts`:

- Publish gates on phase-duration sum == program duration.
- Versioning bumps on edit-after-publish.
- Tenancy: cross-coach reject; owner bypass.
- EOD hook idempotency.
- Migration endpoint maps ordinals correctly; if a removed phase
  in the new version straddles where a client is, the client
  stays at the closest preceding phase.

### 6.5 Backfill of `ProgramTemplate`

A one-shot data migration converts existing `ProgramTemplate` rows:

```sql
-- pseudocode; the actual migration is a Prisma migration script
INSERT INTO programs (id, coach_id, name, description, duration_weeks, state, version, published_at, ...)
SELECT pt.id, pt.coach_id, pt.name, pt.description,
       coalesce((pt.phases::json->>0->>'duration_weeks')::int * (json_array_length(pt.phases::json)), 12),
       'published', 1, pt.created_at, ...
FROM program_templates pt;

INSERT INTO program_phases (program_id, ordinal, name, duration_weeks, ...)
SELECT pt.id, ord.ordinal, ord.phase->>'phase_name',
       (ord.phase->>'duration_weeks')::int, ...
FROM program_templates pt,
     LATERAL json_array_elements(pt.phases::json)
       WITH ORDINALITY AS ord(phase, ordinal);
```

The legacy `ProgramTemplate` model is kept (with a `@deprecated`
schema comment) for one release cycle so any in-flight reference
continues to work; the model is dropped in the next migration.

## 7. Privacy & security

- Same coach-scoping pattern as `01-challenges.md`.
- **Phase attachments** (`content_attachment_ids`,
  `challenge_attachment_ids`) reference the same coach's content /
  challenges. The publish endpoint rejects cross-coach attachment
  refs. The mobile renderer fetches the content via the existing
  per-assignment endpoints, so the signed URL story carries over.

## 8. Abuse & moderation

1. **Coach prescribes a financial product through a regimen
   description.** "By week 6 you should have a Robinhood account
   open." **Mitigation:** description is markdown; same URL
   allowlist (`09-compliance.md`); the platform disclaimer is
   rendered server-side on every regimen detail.
2. **Coach assigns an aggressive timeline that puts a client at
   risk.** "Pay $5000 toward debt by week 4" on a client whose
   income is $3500/mo. **Mitigation:** this is a coaching-quality
   issue, not a technical one. The compliance disclaimer is the
   legal mitigation; the coach onboarding policy is the
   contractual one. Operational mitigation: the alert surface
   surfaces "client behind program target" and the owner queue
   surfaces "program target unrealistic" as a manual review item
   when triggered N times across a coach's roster.
3. **A versioning bug ripples a destructive change to active
   assignments.** **Mitigation:** edits after publish do **not**
   ripple by default — assignments stay pinned to their version.
   Migration is an explicit per-assignment action. Pinned by
   test.

## 9. Feature flags

- Global: `FEATURE_PROGRAMS_ENABLED`. When false, `/api/coach/programs/*`
  and `/api/programs/*` return `404`. The legacy
  `/api/coach/templates/*` continues to work for backward
  compatibility through one release cycle.
- Per-coach:
  `coach_profiles.feature_flags.programs_enabled`. Default false.
- Per-tier: see `08-entitlements.md`. `coach_premium` lifts the
  `max_published_programs` cap.

Kill-switch: global flag. Active assignments stay readable to the
client (the metadata endpoint still works, the EOD hook short-
circuits). New publishes / assignments are rejected.

## 10. Analytics

- `programs.created`, `programs.published`, `programs.assigned`,
  `programs.phase_advanced`, `programs.completed`,
  `programs.abandoned`, `programs.migrated_version`,
  `programs.rescinded`.

Healthy: median program completion time within 30 days of
duration; > 60% of assignments reach final phase.

## 11. Rollout

1. **Founders.** Owner enables the global flag; per-coach for
   founding cohort. The legacy `ProgramTemplate` rows are
   data-migrated. Existing `applyTemplate` calls continue working.
2. **Coach migration.** Coaches use the new authoring surface
   alongside the legacy template flow for one release cycle.
3. **Legacy retirement.** `ProgramTemplate` model is dropped; the
   `applyTemplate` endpoint returns `410 GONE`.

## 12. Tests

- `test/programs.service.spec.ts` — publish gate, versioning,
  tenancy, EOD hook.
- `test/programs.controller.spec.ts` — auth, attachments, Zod.
- `test/programs-doctrine.spec.ts` — DTO + auto-copy.
- `test/programs-backfill.spec.ts` — `ProgramTemplate` →
  `Program` data migration.

## 13. Risks

1. **The legacy `ProgramTemplate` data migration drops fields.**
   `phases.notes` in the legacy `Json` doesn't have a clean home.
   **Response:** the migration concatenates `notes` into the
   target `ProgramPhase.description`. Pinned by test.
2. **Phase-priority drift confuses clients.** Client expects
   "I'm in phase 3 of debt avalanche; why is my priority index
   still 1?". **Response:** the mobile detail screen renders the
   priority delta inline ("priority is at level 1; phase 3
   target is level 3"). Doctrine voice rules apply.
3. **Cohort-level migration of a regimen edit causes mass
   confusion.** A coach edits, migrates 30 active assignments,
   ordinals shift. **Response:** the migrate-version endpoint
   shows a per-assignment preview before commit; coach confirms.

## 14. Dependencies

- `01-challenges.md` — phase challenge attachments.
- `04-content-boards.md` — phase content attachments.
- `08-entitlements.md` — L2/L3 + coach tier caps.
- `09-compliance.md` — URL allowlist, disclaimer.
- `coach.service.ts` — apply-template flow remains live during
  the deprecation cycle.

## 15. Acceptance criteria

- [ ] Schema migration adds the four tables; `ProgramTemplate`
      data migrated; deprecation comment present.
- [ ] Publish gate validates phase-duration sum.
- [ ] Versioning bumps on edit-after-publish; assignments pinned.
- [ ] EOD hook auto-advances phases idempotently.
- [ ] Cross-coach attachment refs rejected at publish.
- [ ] Disclaimer rendered server-side on every program detail.
- [ ] Legacy `applyTemplate` continues working for one release
      cycle.

## 16. Operator handoff

1. Apply migration; migration is non-destructive aside from the
   `ProgramTemplate` row data-copy (rows kept in place).
2. `flyctl secrets set FEATURE_PROGRAMS_ENABLED=false`.
3. Founding cohort: enable per-coach flag.
4. Validate one regimen end-to-end with one founding client.
5. GA: flip global flag.
6. After one release cycle, drop the `ProgramTemplate` model in
   a follow-up migration; the deprecation comment is the
   notification.
