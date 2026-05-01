// Zod contracts for the proof runtime.
//
// Two responsibilities:
//   1. Validate inbound proof submissions (kind-specific shapes for the
//      `source_metadata` JSON column, plus `claimed_amount` rules).
//   2. Define the discriminated-union types the rest of the proof module
//      consumes — service code never reaches into raw `Json` blobs, it
//      branches on `parsed.data.source` and gets a typed payload.
//
// Money rules follow backend/docs/MONEY.md: every monetary field flows
// through `MoneyAmount*` so it lands in the DB as Prisma.Decimal with at
// most 2 decimals and ≤ 12 integer digits.

import { z } from 'zod';
import {
  MoneyAmountAny,
  MoneyAmountPositive,
} from '../common/zod/money';

// Kinds that MUST carry a `claimed_amount`. The proof service rejects
// submissions where a money-bearing kind has no amount, and rejects the
// inverse (an amount on a kind that doesn't carry money) so audit reports
// don't sum unrelated numbers.
export const MONEY_BEARING_KINDS = [
  'net_worth_milestone',
  'income_statement',
  'platform_payout',
] as const;

export type MoneyBearingKind = (typeof MONEY_BEARING_KINDS)[number];

// Kinds that MAY carry a `claimed_amount` but are not required to.
export const OPTIONAL_AMOUNT_KINDS = [
  'finance_screenshot',
  'bank_statement',
] as const;

// Source metadata: a discriminated union over `source`. Each branch defines
// the keys we trust at write time. Anything else on the JSON blob is
// dropped by `.strict()`.

const StorageRefSchema = z
  .object({
    storage_ref: z.string().min(1).max(512),
    mime_type: z.string().min(1).max(128),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/i, 'sha256 must be 64 lowercase hex chars'),
    byte_size: z.number().int().nonnegative().max(50_000_000),
    captured_at: z.string().datetime().optional(),
  })
  .strict();

const AppDerivedSchema = z
  .object({
    derived_from: z.enum([
      'eod_submission',
      'habit_log',
      'account_balance_log',
      'milestone_unlock',
      'ai_request_log',
    ]),
    from_id: z.string().uuid(),
    summary: z.string().max(2000).optional(),
  })
  .strict();

const CoachEnteredSchema = z
  .object({
    entered_by_coach_id: z.string().uuid(),
    note: z.string().max(2000).optional(),
  })
  .strict();

const AdminEnteredSchema = z
  .object({
    entered_by_admin_id: z.string().uuid(),
    reason: z.string().min(1).max(2000),
  })
  .strict();

const ExternalLinkSchema = z
  .object({
    // Restrict to https — http and javascript: links are rejected before
    // any storage. The audit log records the original string so a moderator
    // can see what was attempted if validation rejects.
    url: z
      .string()
      .url()
      .refine((u) => u.startsWith('https://'), 'url must be https'),
    captured_at: z.string().datetime(),
    label: z.string().max(256).optional(),
  })
  .strict();

export const ProofSourceMetadataSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('user_upload') }).merge(StorageRefSchema),
  z.object({ source: z.literal('app_derived') }).merge(AppDerivedSchema),
  z.object({ source: z.literal('coach_entered') }).merge(CoachEnteredSchema),
  z.object({ source: z.literal('admin_entered') }).merge(AdminEnteredSchema),
  z.object({ source: z.literal('external_link') }).merge(ExternalLinkSchema),
]);

export type ProofSourceMetadata = z.infer<typeof ProofSourceMetadataSchema>;

// Submit-proof DTO.
//
// Two-stage validation: the basic shape is checked here, then
// `validateAmountForKind` enforces the money/kind cross-rule because Zod
// can't conditionally require a field across two unrelated keys without an
// awkward refinement.
export const SubmitProofSchema = z
  .object({
    kind: z.enum([
      'net_worth_milestone',
      'finance_screenshot',
      'income_statement',
      'bank_statement',
      'platform_payout',
      'fitness_metric',
      'habit_consistency',
      'coach_report',
      'admin_report',
      'self_report',
      'milestone_review',
    ]),
    claim_label: z.string().min(1).max(256),
    claimed_amount: MoneyAmountAny().optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, 'currency must be ISO 4217 (3 uppercase letters)')
      .default('USD'),
    // ISO date YYYY-MM-DD. Zod 3.22 doesn't expose `.date()` so we
    // validate via regex; the proof service converts to a Date before write.
    occurred_at: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'occurred_at must be YYYY-MM-DD')
      .refine((s) => !Number.isNaN(Date.parse(s)), 'occurred_at must be a valid date'),
    source_metadata: ProofSourceMetadataSchema,
    user_note: z.string().max(2000).optional(),
  })
  .superRefine((data, ctx) => {
    const requiresAmount = (MONEY_BEARING_KINDS as readonly string[]).includes(
      data.kind,
    );
    const allowsAmount =
      requiresAmount ||
      (OPTIONAL_AMOUNT_KINDS as readonly string[]).includes(data.kind);

    if (requiresAmount && data.claimed_amount == null) {
      ctx.addIssue({
        path: ['claimed_amount'],
        code: z.ZodIssueCode.custom,
        message: `claimed_amount is required for kind=${data.kind}`,
      });
    }
    if (!allowsAmount && data.claimed_amount != null) {
      ctx.addIssue({
        path: ['claimed_amount'],
        code: z.ZodIssueCode.custom,
        message: `claimed_amount is not allowed for kind=${data.kind}`,
      });
    }

    // Source/kind sanity: app_derived can't back self_report (the whole
    // point of self_report is no derived evidence). external_link is not
    // valid for fitness/habit kinds — those must be in-app or coach-entered.
    if (data.source_metadata.source === 'app_derived' && data.kind === 'self_report') {
      ctx.addIssue({
        path: ['source_metadata', 'source'],
        code: z.ZodIssueCode.custom,
        message: 'self_report cannot be app_derived',
      });
    }
    if (
      data.source_metadata.source === 'external_link' &&
      (data.kind === 'fitness_metric' || data.kind === 'habit_consistency')
    ) {
      ctx.addIssue({
        path: ['source_metadata', 'source'],
        code: z.ZodIssueCode.custom,
        message: `${data.kind} cannot use external_link as source`,
      });
    }
  });

export type SubmitProofInput = z.infer<typeof SubmitProofSchema>;

// Coach signoff DTO. Decision must be one of the human-review terminal states.
export const SignoffProofSchema = z
  .object({
    decision: z.enum([
      'coach_signed_off',
      'coach_rejected',
      'admin_reviewed',
      'disputed',
    ]),
    note: z.string().max(2000).optional(),
    // For dispute decisions, a reason is required so the audit log isn't
    // empty when a coach overrides a prior signoff.
    reason: z.string().max(2000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.decision === 'disputed' && (!data.reason || data.reason.trim().length === 0)) {
      ctx.addIssue({
        path: ['reason'],
        code: z.ZodIssueCode.custom,
        message: 'reason is required when opening a dispute',
      });
    }
  });

export type SignoffProofInput = z.infer<typeof SignoffProofSchema>;

// Abuse flag DTO.
export const AbuseFlagSchema = z.object({
  reason: z.string().min(1).max(2000),
});

export type AbuseFlagInput = z.infer<typeof AbuseFlagSchema>;

// Amount correction DTO. Used when a coach finds the claimed amount is wrong
// (math error, currency confusion). Always non-negative because we don't
// support negative-amount proofs in this runtime — a debt artifact carries
// a positive number with kind=bank_statement.
export const CorrectAmountSchema = z.object({
  corrected_amount: MoneyAmountPositive(),
  reason: z.string().min(1).max(2000),
});

export type CorrectAmountInput = z.infer<typeof CorrectAmountSchema>;

// Staleness thresholds, in days, per kind. Read by `markStaleArtifacts` in
// the proof service. Kept in the contracts module so any consumer (sweeper,
// AI flagger, mobile client) imports the same source of truth.
export const STALENESS_THRESHOLD_DAYS: Record<string, number> = {
  net_worth_milestone: 60,
  finance_screenshot: 45,
  income_statement: 90,
  bank_statement: 45,
  platform_payout: 45,
  fitness_metric: 30,
  habit_consistency: 14,
  coach_report: 180,
  admin_report: 365,
  self_report: 30,
  milestone_review: 365,
};
