// Read-only export shape for proof artifacts that are safe to include in
// a prompt context.
//
// Why a separate file: the proof module (PR #112) owns the canonical proof
// schema, write paths, and authority semantics. This module never imports
// from `proof/*` — instead it defines a wire-stable export shape that
// any caller (including a future ProofService.exportForGateway) can
// produce on demand. That keeps the gateway free of a Prisma dependency
// for tests and avoids duplicating proof's write-path validation.
//
// Doctrine:
//   - No internal proof row id leaves this surface. Callers map id →
//     `correlation_id` via a stable hash (see `correlationIdFor`).
//   - Money values are pre-formatted strings, never numbers/Decimals.
//   - Free-text fields (notes, claim labels) are dropped here because
//     they cross the privacy boundary; if a future caller wants them,
//     it must opt in via a separate, explicitly-reviewed export shape.
//   - Nothing on this surface can be used to mutate proof state. The
//     gateway uses it as input to a prompt; the prompt produces a
//     draft; drafts go through `ProofService.signoff` (a human action)
//     before they affect status.

import { z } from 'zod';
import { createHash } from 'crypto';

import {
  AUTHORITY_BANDS,
  PROVENANCE_SOURCES,
  type AuthorityBand,
  type ProvenanceSource,
} from './gateway-contracts';

// Mirror of proof's ProofKind enum. Restated here so this module can be
// consumed without importing from `proof/*`. If a new kind is added in
// proof, this list is updated in lockstep — `bandForStatus` and the
// kind-set are the only two cross-walks the gateway maintains.
export const PROOF_KIND_VALUES = [
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
] as const;

export type ProofKindValue = (typeof PROOF_KIND_VALUES)[number];

// Mirror of proof's ProofStatus enum. Used only for the status →
// authority-band cross-walk.
export const PROOF_STATUS_VALUES = [
  'pending_review',
  'coach_signed_off',
  'coach_rejected',
  'admin_reviewed',
  'disputed',
  'flagged_abuse',
  'stale',
  'superseded',
] as const;

export type ProofStatusValue = (typeof PROOF_STATUS_VALUES)[number];

/**
 * Maps a proof status to the coarse authority band the gateway carries
 * into prompt context. The mapping is intentionally conservative:
 *
 *   - `coach_signed_off` and `admin_reviewed` are authoritative.
 *   - `pending_review` is pending — never authoritative on its own.
 *   - Everything else (rejected/disputed/abuse/stale/superseded) is
 *     non-authoritative and SHOULD NOT be summarised by the model as
 *     verified progress.
 *
 * Aligned with `AUTHORITATIVE_STATUSES` in proof.service.ts so coach
 * summaries and gateway prompts agree on what counts.
 */
export function bandForStatus(status: ProofStatusValue): AuthorityBand {
  switch (status) {
    case 'coach_signed_off':
    case 'admin_reviewed':
      return 'authoritative';
    case 'pending_review':
      return 'pending';
    case 'coach_rejected':
    case 'disputed':
    case 'flagged_abuse':
    case 'stale':
    case 'superseded':
      return 'non_authoritative';
  }
}

/**
 * Stable opaque correlation id for a proof artifact. NOT reversible —
 * the gateway never sees the raw row id. The same (artifact_id, salt)
 * always produces the same correlation id so audit logs across drafts
 * line up; rotating the salt forces a fresh correlation namespace.
 *
 * The salt should be configured server-side (env: AI_GATEWAY_CORRELATION_SALT)
 * and rotated when the audit namespace is reset. We don't read the env
 * here — callers pass the salt explicitly so this function stays pure
 * and trivially testable.
 */
export function correlationIdFor(artifactId: string, salt: string): string {
  if (!artifactId || !salt) {
    throw new Error('correlationIdFor: artifactId and salt are required');
  }
  // 32 hex chars (128 bits) is plenty for dedup; we slice from sha256
  // rather than using sha1 to avoid the tooling lint nag on weak hashes.
  return createHash('sha256')
    .update(`${salt}:${artifactId}`)
    .digest('hex')
    .slice(0, 32);
}

// The exported, read-only shape. `.strict()` so an upstream change in
// proof can't silently leak new fields into a prompt.
export const ProofProvenanceExportSchema = z
  .object({
    correlation_id: z.string().min(1).max(64),
    kind: z.enum(PROOF_KIND_VALUES),
    band: z.enum(AUTHORITY_BANDS),
    source: z.enum(PROVENANCE_SOURCES),
    occurred_at: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'occurred_at must be YYYY-MM-DD'),
    // Pre-formatted display value. Optional because not every proof kind
    // carries a money amount.
    display_amount: z.string().min(1).max(64).nullable(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, 'currency must be ISO 4217')
      .nullable(),
    // ISO 8601 timestamp of when this row was last updated. Used only
    // for staleness signal in the prompt counter; never echoed to the
    // model verbatim.
    updated_at: z.string().datetime(),
  })
  .strict();

export type ProofProvenanceExport = z.infer<typeof ProofProvenanceExportSchema>;

// Convenience: count exports by authority band. Pure, no IO. Used by
// callers building a `FinanceSafePromptContext` to populate counters
// without re-implementing the band logic.
export function countByBand(
  exports_: readonly ProofProvenanceExport[],
): {
  authoritative: number;
  pending: number;
  non_authoritative: number;
} {
  const out = { authoritative: 0, pending: 0, non_authoritative: 0 };
  for (const e of exports_) {
    out[e.band] += 1;
  }
  return out;
}

// Re-export the source list so a consumer that only imports this module
// has everything it needs to build the gateway request.
export { PROVENANCE_SOURCES, AUTHORITY_BANDS };
export type { AuthorityBand, ProvenanceSource };
