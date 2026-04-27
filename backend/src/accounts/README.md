# Accounts

CRUD over `FinancialAccount` and read access to per-account balance
history. The user-facing list/edit screens in the mobile app are wired
straight to this module.

## Files

- `accounts.controller.ts` — `/api/accounts` GET / POST, `/api/accounts/:id`
  GET / PUT / DELETE, `/api/accounts/:id/history`.
- `accounts.service.ts` — CRUD + ownership checks + balance log
  bootstrap.
- `accounts.module.ts`.

## Endpoints

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/accounts` | Active accounts ordered by `is_debt asc, balance desc` (assets first, biggest first). |
| POST | `/api/accounts` | Create. Auto-derives `is_debt` from `account_type` if omitted. Writes a starter `AccountBalanceLog` with `source = onboarding`. |
| PUT | `/api/accounts/:id` | Update. Ownership re-checked. |
| DELETE | `/api/accounts/:id` | Soft-delete (`is_active = false`). History preserved. |
| GET | `/api/accounts/:id/history?days=30` | The account row + its `account_balance_logs` for the window. |

## Account types and `is_debt`

`isDebtType` whitelists the seven debt enum values:
`credit_card`, `personal_loan`, `student_loan`, `auto_loan`,
`mortgage`, `medical_debt`, `other_debt`. Any other type is treated as
an asset. The mobile UI sends an explicit `is_debt` only when the user
overrides; otherwise the server picks the right side from the enum.

If you add a new `AccountType`, decide which side it belongs on and
update `isDebtType` here **and** the savings-rate filter in
`networth.service.ts`. The two filters should always agree.

## Soft-delete semantics

`deleteAccount` does **not** delete. It flips `is_active = false`.
History (`AccountBalanceLog`) is kept so net-worth charts that span
the deletion still render, and old `EODSubmission.account_snapshots`
entries that referenced the account remain valid. The mobile UI
hides inactive accounts from the active list but can still surface
them in audit / history views via direct queries.

## Security & tenancy

Every method that takes an `accountId` re-checks `account.user_id ===
userId` after the lookup and throws `FORBIDDEN` otherwise.
`request.user.id` is always the authoritative identity.

## Environment variables

None unique to this module.

## Failure modes

| Code | When |
|------|------|
| `NOT_FOUND` | Account id doesn't exist. |
| `FORBIDDEN` | Account belongs to another user. |
| Validation | `class-validator` / Zod schemas reject malformed bodies. |

## Tests

Account-CRUD-specific specs are folded into the EOD spec because the
EOD submit path exercises every account write. A direct
`accounts.service.spec.ts` is a near-term TODO — coverage on the
soft-delete + history-after-delete path would be the most valuable.

## Operations

- Hard-deletion is **not** exposed by the API on purpose. If a user
  asks for a hard delete (GDPR / data export), do it via the
  `users.service.ts` data-export + delete-account flow, which cascades
  through Prisma's `onDelete: Cascade` on the `User` row.
- Bulk import: write balances directly into `FinancialAccount`, log
  rows into `AccountBalanceLog` with `source = onboarding`, then call
  `ProfileService.computeAndUpdateTotals` for the user. Skipping the
  log rows means savings-rate trends start from the import date.
