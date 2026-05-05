// Shared Zod schema for money values entering the API.
//
// Doctrine (audits/finance_mvp_to_enterprise.md):
//   - All money fields are DECIMAL(14, 2) server-side.
//   - No `number` for money on the wire — accept string or number from the
//     client, but coerce to Prisma.Decimal before any DB write.
//   - No `parseFloat` on user input.
//
// Usage:
//   import { MoneyAmount, MoneyAmountStrict } from '../common/zod/money';
//
//   const Schema = z.object({
//     balance: MoneyAmount(),                       // any sign, including zero
//     paycheck: MoneyAmount({ allowNegative: false, allowZero: false }),
//     min_payment: MoneyAmount({ allowNegative: false }).optional(),
//   });
//
// The output type of every MoneyAmount field is Prisma.Decimal — pass it
// straight to Prisma. For services that still do arithmetic in plain Number,
// call toN() from common/money.ts at the boundary.

import { Prisma } from '@prisma/client';
import { z } from 'zod';

export type MoneyAmount = Prisma.Decimal;

export interface MoneyAmountOptions {
  /** Allow exactly zero. Default: true. */
  allowZero?: boolean;
  /** Allow negative values. Default: false (almost every money field is >= 0). */
  allowNegative?: boolean;
}

// DECIMAL(14, 2): up to 12 digits before the decimal, up to 2 after.
// Reject more than 2 decimal places (e.g. "1.234") so we never silently round
// or truncate user-entered cents.
const MONEY_REGEX = /^-?\d{1,12}(?:\.\d{1,2})?$/;

/**
 * Build a Zod schema that accepts a money value (string or number) and
 * outputs a Prisma.Decimal.
 *
 * Rejects: NaN, ±Infinity, non-finite numbers, strings with > 2 decimal
 * places, strings with > 12 integer digits, non-numeric strings, and
 * (by default) negative values.
 */
export function MoneyAmount(opts: MoneyAmountOptions = {}) {
  const { allowZero = true, allowNegative = false } = opts;

  return z
    .union([z.string(), z.number()])
    .superRefine((raw, ctx) => {
      if (typeof raw === 'number') {
        if (!Number.isFinite(raw)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Money value must be a finite number',
          });
          return;
        }
        // Convert to canonical string with at most 2 decimals to validate
        // precision; any more than that is a real client error, not rounding.
        const fixed = raw.toString();
        if (!MONEY_REGEX.test(fixed)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'Money value must have at most 2 decimal places and 12 digits before the decimal',
          });
          return;
        }
      } else {
        // string
        const trimmed = raw.trim();
        if (trimmed.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Money value cannot be empty',
          });
          return;
        }
        if (!MONEY_REGEX.test(trimmed)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'Money value must be a number string with at most 2 decimal places (e.g. "123.45")',
          });
          return;
        }
      }
    })
    .transform((raw) => {
      // After superRefine guards, this is safe.
      const asString = typeof raw === 'number' ? raw.toString() : raw.trim();
      return new Prisma.Decimal(asString);
    })
    .superRefine((dec, ctx) => {
      if (!allowNegative && dec.isNegative()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Money value must not be negative',
        });
      }
      if (!allowZero && dec.isZero()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Money value must not be zero',
        });
      }
    });
}

/** Strict positive money — used for paycheck/payday/income amounts. */
export const MoneyAmountPositive = () =>
  MoneyAmount({ allowZero: false, allowNegative: false });

/** Allow zero but not negatives — typical for balances and minimum payments. */
export const MoneyAmountNonNegative = () =>
  MoneyAmount({ allowZero: true, allowNegative: false });

/** Allow zero and negatives — used for asset balances that can swing negative. */
export const MoneyAmountAny = () =>
  MoneyAmount({ allowZero: true, allowNegative: true });
