# Money handling — the doctrine

> All money fields are `Decimal(14, 2)` server-side. No `number` for money on
> the wire. No `parseFloat` on user input.

This file is the canonical reference. `backend/README.md` § "Money handling"
links here. Read it before adding any endpoint that writes money.

## Where money values live

| Layer | Type | Notes |
|---|---|---|
| Database | `DECIMAL(14, 2)` | Postgres column type; never `float`, never `int cents`. |
| Prisma client | `Prisma.Decimal` | Auto-generated. Math via `.plus`, `.minus`, `.times`, `.dividedBy`. |
| Service input (DTO) | `Prisma.Decimal` | Produced by `MoneyAmount` Zod schema. |
| Service arithmetic | `Prisma.Decimal` (preferred) or `number` via `toN()` | Use Decimal for sums of monetary values. Use `toN()` only at the boundary. |
| HTTP response | `number` | `DecimalToNumberInterceptor` walks responses and converts. |

## The shared schema: `MoneyAmount`

Located in `src/common/zod/money.ts`. Three preset variants:

- `MoneyAmount({ allowZero, allowNegative })` — fully configurable.
- `MoneyAmountPositive()` — paychecks, allocations, income, dream cost.
- `MoneyAmountNonNegative()` — minimum payments, fees.
- `MoneyAmountAny()` — account balances (can swing negative on overdraft).

All four:

- Accept `string` ("1234.56") OR `number` (1234.56).
- Reject `NaN`, `±Infinity`, non-finite numbers.
- Reject more than 2 decimal places ("1.234").
- Reject more than 12 integer digits.
- Reject non-numeric strings ("abc"), empty strings, booleans, objects.
- Output a `Prisma.Decimal`.

## Locked-down write surfaces

Every money input on these endpoints flows through `MoneyAmount`:

| Surface | DTO schema | Endpoint(s) |
|---|---|---|
| EOD reconciliation | `SubmitEODSchema` | `POST /api/eod`, `PUT /api/eod/:id` |
| Payday | `DeployPaycheckSchema`, `SavePaydayTemplateSchema` | `POST /api/payday`, `POST /api/payday/templates` |
| Onboarding | `SubmitQuizSchema`, `UpdateProfileSchema` | `POST /api/onboarding/quiz`, profile updates |
| Accounts | `CreateAccountSchema`, `UpdateAccountSchema` | `POST /api/accounts`, `PUT /api/accounts/:id` |

## Adding a new money-writing endpoint

```ts
// 1. Schema — use MoneyAmount, not z.number()
import { z } from 'zod';
import { MoneyAmountPositive } from '../common/zod/money';

export const RecordExpenseSchema = z.object({
  account_id: z.string().uuid(),
  amount: MoneyAmountPositive(),  // → Prisma.Decimal
  category: z.string().min(1),
});

// 2. Controller — safeParse, propagate validation errors as 400
@Post()
async record(@Body() body: any, @CurrentUser() user: any) {
  const parsed = RecordExpenseSchema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException({
      error: parsed.error.errors.map((e) => e.message).join(', '),
      code: 'VALIDATION_ERROR',
    });
  }
  return this.service.record(user.id, parsed.data);
}

// 3. Service — accept Prisma.Decimal, pass it straight to Prisma
async record(userId: string, dto: { account_id: string; amount: Prisma.Decimal; category: string }) {
  return this.prisma.expense.create({
    data: {
      user_id: userId,
      account_id: dto.account_id,
      amount: dto.amount,        // ← no parseFloat, no Number()
      category: dto.category,
    },
  });
}
```

## Forbidden patterns (will fail review)

- `z.number().positive()` for money → use `MoneyAmountPositive()`.
- `parseFloat(answers.monthly_take_home)` → Zod already coerced.
- `data: { balance: Number(snapshot.balance) }` → pass the Decimal.
- `amount: number` on a service that persists money → use `Prisma.Decimal`.
- Summing money values with `+` on Decimals → Decimal `.plus()` chain, then
  `toN()` at the boundary if the consumer needs a number.

## Why we accept both string and number

The mobile client sends money as JSON, which serialises a Decimal-shaped
value as either a number (e.g. `1234.56`) or a string (e.g. `"1234.56"`)
depending on the form widget. Strings are safer (no IEEE-754 round-trip on
the wire), but accepting both keeps the schema flexible for legacy
callers. Either way, the schema produces a `Prisma.Decimal` and downstream
code never sees a raw `parseFloat` result.
