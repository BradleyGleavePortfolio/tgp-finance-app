# Accountability

Pairs two students of the same coach so they can see each other's
streak, velocity score, priority index, and "submitted today?" — but
not each other's actual balances. The accountability_pair pointer is a
single field on `User`; pairing writes to both rows symmetrically.

## Files

- `accountability.controller.ts` — `/api/accountability/partner` (GET)
  and `/api/accountability/pair` (POST, coach-only).
- `accountability.service.ts` — partner read + the pair-students
  mutation.
- `accountability.module.ts`.

## Endpoints

| Method | Path | Auth | Body | Returns |
|--------|------|------|------|---------|
| GET | `/api/accountability/partner` | JWT | — | The caller's partner with privacy-scoped fields, plus `submitted_today`. Returns `{ partner: null }` when no pair is set. |
| POST | `/api/accountability/pair` | JWT + `coach`/`owner` | `{ student_id_1, student_id_2 }` | `{ message, pair: [id1, id2] }`. |

## Privacy contract

The partner read **deliberately omits** every money field. The Prisma
`select` only pulls `wealth_velocity_score`, `current_priority_index`,
and `last_eod_date`. Net worth, debt, assets, and cash are never
relayed. The privacy boundary lives in the `select` clause itself —
no scrubbing post-query — so a future schema change that adds a
money-bearing field to `FinancialProfile` does not accidentally leak it.

## Cross-tenant pairing fix

The original implementation accepted any two `studentId` values from
any coach and wrote the pair pointer on both rows. A coach could
overwrite the `accountability_pair` field on students belonging to a
*different* coach, violating the coach-ownership contract. The current
implementation:

1. Loads both students.
2. Rejects unless **both** are `role === 'student'`.
3. For non-owner callers, requires **both** students to be in the
   calling coach's roster (`coach_id === user.id`). The OWNER bypass
   is explicit (owners can pair across tenants by product rule).
4. Then writes both `accountability_pair` fields.

If you add a feature that mutates a student via a coach action,
mirror this pattern: validate the target's role, then validate roster
membership, with an explicit owner branch.

## Data flow

`getPartner(userId)`:

1. Read the caller's `accountability_pair` (a user id, or null).
2. If null, return `{ partner: null }`.
3. Pull the partner with the privacy-scoped `select`.
4. Check whether the partner has an EOD submission for today (UTC date
   range).
5. Return the projected fields + `submitted_today`.

`pairStudents(coachId, s1, s2, role)`:

1. Reject self-pair.
2. Load both, validate role + tenancy as above.
3. Update both rows in a `Promise.all`. There is no transaction here —
   the two writes are independent and the worst case of a half-write
   is a "one-way" pair, which the read endpoint surfaces as null
   partner from the unwritten side. Worth wrapping in a transaction
   if we ever see drift in production.

## Security & tenancy

- The pair-students endpoint is the only mutating surface and is
  coach-only. Self-pair via the partner GET endpoint is impossible —
  it only reads.
- The privacy projection on `getPartner` is the entire trust model
  for the partner widget; do not widen the `select` without product
  approval.

## Environment variables

None unique to this module.

## Failure modes

| Code | When |
|------|------|
| `INVALID_PAIR` | `student_id_1 === student_id_2`. |
| `NOT_FOUND` | One or both students missing. |
| `INVALID_PAIR_TARGETS` | Either user isn't a student. |
| `NOT_YOUR_STUDENTS` | Non-owner coach tried to pair across rosters. |
| `VALIDATION_ERROR` | Zod rejection on the body shape. |

## Tests

`backend/test/accountability.service.spec.ts` covers:

- self-pair rejection,
- cross-coach pairing rejection (regression test for the
  source-of-truth fix),
- owner-bypass cross-tenant pair,
- partner read returns no money fields.

## Operations

- Unpairing today is a direct DB update (set
  `accountability_pair = null` on both rows). A coach unpair endpoint
  is a near-term TODO — when added, mirror the role + roster check.
- Partner status is *not* relayed in any cross-channel comm beyond
  the authenticated GET endpoint.
