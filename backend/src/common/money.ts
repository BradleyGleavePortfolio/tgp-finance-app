// Helpers for money values.
//
// Money columns are DECIMAL(14, 2) in Postgres, which Prisma surfaces as a
// Decimal.js instance. Internally we collapse to Number because DECIMAL(14, 2)
// (max ~$99 trillion) fits comfortably inside JS Number precision (2^53), and
// sticking to Number keeps the JSON shape stable for the mobile client (the
// DecimalToNumberInterceptor does the same conversion on response payloads).
//
// When *accepting* money from user input for Prisma writes, pass a number
// through — Prisma will coerce it to Decimal via its driver. For arithmetic
// that already runs in this service, keep using number.
//
// Use `toN` whenever you're mixing Prisma Decimal outputs into arithmetic.

import { Prisma } from '@prisma/client';

export function toN(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  // Prisma.Decimal instance
  return value.toNumber();
}

// For nullable fields where 0 is not a sensible default.
export function toNullableN(
  value: Prisma.Decimal | number | string | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return value.toNumber();
}
