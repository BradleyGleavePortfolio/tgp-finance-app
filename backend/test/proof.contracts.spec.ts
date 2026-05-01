import { Prisma } from '@prisma/client';
import {
  AbuseFlagSchema,
  CorrectAmountSchema,
  ProofSourceMetadataSchema,
  SignoffProofSchema,
  STALENESS_THRESHOLD_DAYS,
  SubmitProofSchema,
} from '../src/proof/contracts';

// Minimum valid user_upload metadata, reused across tests.
const SAMPLE_UPLOAD = {
  source: 'user_upload' as const,
  storage_ref: 'proof/abc/123.png',
  mime_type: 'image/png',
  sha256: 'a'.repeat(64),
  byte_size: 12345,
};

describe('SubmitProofSchema', () => {
  it('accepts a net_worth_milestone with claimed_amount', () => {
    const r = SubmitProofSchema.safeParse({
      kind: 'net_worth_milestone',
      claim_label: 'NW $100k',
      claimed_amount: '100000.00',
      occurred_at: '2026-04-30',
      source_metadata: SAMPLE_UPLOAD,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.claimed_amount).toBeInstanceOf(Prisma.Decimal);
      expect(r.data.claimed_amount!.toString()).toBe('100000');
      expect(r.data.currency).toBe('USD');
    }
  });

  it('rejects net_worth_milestone without claimed_amount', () => {
    const r = SubmitProofSchema.safeParse({
      kind: 'net_worth_milestone',
      claim_label: 'NW $100k',
      occurred_at: '2026-04-30',
      source_metadata: SAMPLE_UPLOAD,
    });
    expect(r.success).toBe(false);
  });

  it('rejects fitness_metric WITH claimed_amount (not money-bearing)', () => {
    const r = SubmitProofSchema.safeParse({
      kind: 'fitness_metric',
      claim_label: 'Squat PR',
      claimed_amount: '350.00',
      occurred_at: '2026-04-30',
      source_metadata: {
        source: 'coach_entered',
        entered_by_coach_id: '11111111-1111-1111-1111-111111111111',
        note: 'observed in session',
      },
    });
    expect(r.success).toBe(false);
  });

  it('accepts fitness_metric without claimed_amount', () => {
    const r = SubmitProofSchema.safeParse({
      kind: 'fitness_metric',
      claim_label: 'Squat PR 350lb',
      occurred_at: '2026-04-30',
      source_metadata: {
        source: 'coach_entered',
        entered_by_coach_id: '11111111-1111-1111-1111-111111111111',
      },
    });
    expect(r.success).toBe(true);
  });

  it('rejects self_report backed by app_derived (logical contradiction)', () => {
    const r = SubmitProofSchema.safeParse({
      kind: 'self_report',
      claim_label: 'Felt good today',
      occurred_at: '2026-04-30',
      source_metadata: {
        source: 'app_derived',
        derived_from: 'eod_submission',
        from_id: '22222222-2222-2222-2222-222222222222',
      },
    });
    expect(r.success).toBe(false);
  });

  it('rejects fitness_metric backed by external_link', () => {
    const r = SubmitProofSchema.safeParse({
      kind: 'fitness_metric',
      claim_label: 'Marathon time',
      occurred_at: '2026-04-30',
      source_metadata: {
        source: 'external_link',
        url: 'https://example.com/run',
        captured_at: '2026-04-30T12:00:00.000Z',
      },
    });
    expect(r.success).toBe(false);
  });

  it('rejects http (non-https) external_link', () => {
    const r = SubmitProofSchema.safeParse({
      kind: 'income_statement',
      claim_label: 'Pay stub Apr',
      claimed_amount: '5500.00',
      occurred_at: '2026-04-30',
      source_metadata: {
        source: 'external_link',
        url: 'http://example.com/stub',
        captured_at: '2026-04-30T12:00:00.000Z',
      },
    });
    expect(r.success).toBe(false);
  });

  it('rejects malformed currency', () => {
    const r = SubmitProofSchema.safeParse({
      kind: 'income_statement',
      claim_label: 'Pay stub',
      claimed_amount: '5000',
      currency: 'usd',
      occurred_at: '2026-04-30',
      source_metadata: SAMPLE_UPLOAD,
    });
    expect(r.success).toBe(false);
  });

  it('rejects malformed occurred_at', () => {
    const r = SubmitProofSchema.safeParse({
      kind: 'self_report',
      claim_label: 'note',
      occurred_at: '04/30/2026',
      source_metadata: { source: 'coach_entered', entered_by_coach_id: '11111111-1111-1111-1111-111111111111' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects upload metadata with an oversized byte_size', () => {
    const r = ProofSourceMetadataSchema.safeParse({
      ...SAMPLE_UPLOAD,
      byte_size: 51_000_000,
    });
    expect(r.success).toBe(false);
  });

  it('rejects upload metadata with a non-hex sha256', () => {
    const r = ProofSourceMetadataSchema.safeParse({
      ...SAMPLE_UPLOAD,
      sha256: 'not-a-real-sha256',
    });
    expect(r.success).toBe(false);
  });

  it('strips unknown keys via .strict on each source variant', () => {
    const r = ProofSourceMetadataSchema.safeParse({
      ...SAMPLE_UPLOAD,
      extra_key: 'should be rejected',
    });
    expect(r.success).toBe(false);
  });
});

describe('SignoffProofSchema', () => {
  it('accepts a coach signoff with a note', () => {
    const r = SignoffProofSchema.safeParse({
      decision: 'coach_signed_off',
      note: 'verified vs April statement',
    });
    expect(r.success).toBe(true);
  });

  it('rejects a dispute decision without a reason', () => {
    const r = SignoffProofSchema.safeParse({ decision: 'disputed' });
    expect(r.success).toBe(false);
  });

  it('accepts a dispute with a reason', () => {
    const r = SignoffProofSchema.safeParse({
      decision: 'disputed',
      reason: 'screenshot does not show institution name',
    });
    expect(r.success).toBe(true);
  });

  it('rejects non-review terminal states', () => {
    const r = SignoffProofSchema.safeParse({ decision: 'flagged_abuse' });
    expect(r.success).toBe(false);
  });
});

describe('AbuseFlagSchema', () => {
  it('requires a reason', () => {
    expect(AbuseFlagSchema.safeParse({}).success).toBe(false);
    expect(AbuseFlagSchema.safeParse({ reason: '' }).success).toBe(false);
    expect(AbuseFlagSchema.safeParse({ reason: 'duplicate of #123' }).success).toBe(true);
  });
});

describe('CorrectAmountSchema', () => {
  it('coerces corrected_amount to Decimal and requires a reason', () => {
    const r = CorrectAmountSchema.safeParse({
      corrected_amount: '7500.50',
      reason: 'currency conversion error',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.corrected_amount).toBeInstanceOf(Prisma.Decimal);
    }
  });

  it('rejects negative corrections', () => {
    const r = CorrectAmountSchema.safeParse({
      corrected_amount: '-50.00',
      reason: 'oops',
    });
    expect(r.success).toBe(false);
  });

  it('rejects without a reason', () => {
    const r = CorrectAmountSchema.safeParse({ corrected_amount: '100.00' });
    expect(r.success).toBe(false);
  });
});

describe('STALENESS_THRESHOLD_DAYS', () => {
  it('covers every ProofKind defined in contracts', () => {
    const kinds = [
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
    ];
    for (const k of kinds) {
      expect(STALENESS_THRESHOLD_DAYS[k]).toBeGreaterThan(0);
    }
  });
});
