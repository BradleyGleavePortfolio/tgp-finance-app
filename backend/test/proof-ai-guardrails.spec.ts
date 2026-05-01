import { BadRequestException } from '@nestjs/common';
import { Prisma, ProofArtifact, ProofKind, ProofSource, ProofStatus } from '@prisma/client';
import { ProofAIService } from '../src/proof/proof-ai.service';
import { ProofService } from '../src/proof/proof.service';

// Light fakes — the guardrail logic is pure; we don't need a real DB.
const fakePrisma: any = {
  proofArtifact: { findUnique: jest.fn() },
  proofAIDraft: { create: jest.fn() },
  proofAuditLog: { create: jest.fn().mockResolvedValue({}) },
};

const fakeProofService = {
  audit: jest.fn().mockResolvedValue(undefined),
} as unknown as ProofService;

function makeArtifact(overrides: Partial<ProofArtifact> = {}): ProofArtifact {
  return {
    id: overrides.id ?? 'a-1',
    user_id: 'u-1',
    reviewer_id: null,
    kind: ProofKind.income_statement,
    status: ProofStatus.coach_signed_off,
    source: ProofSource.user_upload,
    claim_label: 'Pay stub',
    claimed_amount: new Prisma.Decimal('5000.00'),
    currency: 'USD',
    occurred_at: new Date('2026-04-15'),
    submitted_at: new Date('2026-04-16'),
    reviewed_at: new Date('2026-04-17'),
    source_metadata: {} as any,
    user_note: null,
    dispute_reason: null,
    abuse_flag_reason: null,
    stale_after_days: null,
    superseded_by_id: null,
    created_at: new Date('2026-04-16'),
    updated_at: new Date('2026-04-17'),
    ...overrides,
  };
}

describe('ProofAIService.assertSafeDraftText', () => {
  let svc: ProofAIService;

  beforeEach(() => {
    svc = new ProofAIService(fakePrisma, fakeProofService);
  });

  const bad = [
    'You should buy this index fund tomorrow.',
    'I recommend buying TSLA at the open.',
    'This stock will double by Friday.',
    'Move your portfolio into crypto.',
    'Risk-free profit if you act now.',
    'Guaranteed return of 14% annually.',
  ];

  for (const phrase of bad) {
    it(`rejects prescriptive language: "${phrase}"`, () => {
      expect(() => svc.assertSafeDraftText(phrase)).toThrow(BadRequestException);
    });
  }

  const good = [
    'Two pay stubs landed in April; both signed off by coach.',
    'Net worth claim of $100,000 on 2026-04-30 backed by Fidelity screenshot.',
    'No finance proof submitted in the last 60 days. Surface to coach.',
    'Habit consistency: 28 of 30 days logged. Coach review pending.',
  ];

  for (const phrase of good) {
    it(`accepts descriptive language: "${phrase.slice(0, 40)}..."`, () => {
      expect(() => svc.assertSafeDraftText(phrase)).not.toThrow();
    });
  }

  it('rejects empty text', () => {
    expect(() => svc.assertSafeDraftText('')).toThrow(BadRequestException);
    expect(() => svc.assertSafeDraftText('    ')).toThrow(BadRequestException);
  });

  it('rejects oversized text (>4000 chars)', () => {
    expect(() => svc.assertSafeDraftText('a'.repeat(4001))).toThrow(BadRequestException);
  });
});

describe('ProofAIService.persistDraft', () => {
  let svc: ProofAIService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new ProofAIService(fakePrisma, fakeProofService);
  });

  it('rejects an unknown draft_kind before any DB call', async () => {
    await expect(
      svc.persistDraft({
        artifact_id: 'a-1',
        // @ts-expect-error — testing the runtime guard
        draft_kind: 'recommend_purchase',
        draft_text: 'whatever',
        model_label: 'm',
        prompt_version: 'v1',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(fakePrisma.proofArtifact.findUnique).not.toHaveBeenCalled();
  });

  it('rejects when artifact is flagged_abuse', async () => {
    fakePrisma.proofArtifact.findUnique.mockResolvedValueOnce(
      makeArtifact({ status: ProofStatus.flagged_abuse }),
    );
    await expect(
      svc.persistDraft({
        artifact_id: 'a-1',
        draft_kind: 'summary',
        draft_text: 'Looks fine.',
        model_label: 'm',
        prompt_version: 'v1',
      }),
    ).rejects.toThrow(/flagged for abuse/);
    expect(fakePrisma.proofAIDraft.create).not.toHaveBeenCalled();
  });

  it('rejects empty model_label or prompt_version', async () => {
    await expect(
      svc.persistDraft({
        artifact_id: 'a-1',
        draft_kind: 'summary',
        draft_text: 'ok',
        model_label: '',
        prompt_version: 'v1',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('writes the draft and emits an ai_draft_generated audit event', async () => {
    fakePrisma.proofArtifact.findUnique.mockResolvedValueOnce(makeArtifact());
    fakePrisma.proofAIDraft.create.mockResolvedValueOnce({
      id: 'd-1',
      artifact_id: 'a-1',
    });

    const result = await svc.persistDraft({
      artifact_id: 'a-1',
      draft_kind: 'summary',
      draft_text: 'Pay stub for April backed by screenshot.',
      model_label: 'perplexity:sonar-pro',
      prompt_version: 'proof-summary@v1',
    });

    expect(result.id).toBe('d-1');
    expect(fakeProofService.audit).toHaveBeenCalledWith(
      'a-1',
      expect.objectContaining({ role: 'ai' }),
      'ai_draft_generated',
      expect.objectContaining({
        draft_id: 'd-1',
        draft_kind: 'summary',
        model_label: 'perplexity:sonar-pro',
      }),
    );
  });
});

describe('ProofAIService.detectAmountContradictions', () => {
  let svc: ProofAIService;

  beforeEach(() => {
    svc = new ProofAIService(fakePrisma, fakeProofService);
  });

  it('flags two coach-signed-off artifacts of the same kind on the same day with different amounts', () => {
    const a = makeArtifact({
      id: 'a-1',
      kind: ProofKind.income_statement,
      claimed_amount: new Prisma.Decimal('5000.00'),
      occurred_at: new Date('2026-04-15'),
    });
    const b = makeArtifact({
      id: 'a-2',
      kind: ProofKind.income_statement,
      claimed_amount: new Prisma.Decimal('5500.00'),
      occurred_at: new Date('2026-04-15'),
    });
    const result = svc.detectAmountContradictions([a, b]);
    expect(result).toHaveLength(1);
    expect(result[0].ids.sort()).toEqual(['a-1', 'a-2']);
  });

  it('does not flag identical amounts', () => {
    const a = makeArtifact({ id: 'a-1', claimed_amount: new Prisma.Decimal('5000.00') });
    const b = makeArtifact({ id: 'a-2', claimed_amount: new Prisma.Decimal('5000.00') });
    expect(svc.detectAmountContradictions([a, b])).toHaveLength(0);
  });

  it('ignores non-authoritative-eligible artifacts', () => {
    const a = makeArtifact({
      id: 'a-1',
      claimed_amount: new Prisma.Decimal('5000.00'),
      status: ProofStatus.disputed,
    });
    const b = makeArtifact({
      id: 'a-2',
      claimed_amount: new Prisma.Decimal('5500.00'),
      status: ProofStatus.coach_signed_off,
    });
    expect(svc.detectAmountContradictions([a, b])).toHaveLength(0);
  });

  it('ignores artifacts without a claimed_amount', () => {
    const a = makeArtifact({ id: 'a-1', kind: ProofKind.fitness_metric, claimed_amount: null });
    const b = makeArtifact({ id: 'a-2', kind: ProofKind.fitness_metric, claimed_amount: null });
    expect(svc.detectAmountContradictions([a, b])).toHaveLength(0);
  });
});

describe('ProofAIService.buildContext', () => {
  let svc: ProofAIService;

  beforeEach(() => {
    svc = new ProofAIService(fakePrisma, fakeProofService);
  });

  it('counts authoritative, pending, flagged, and stale correctly', () => {
    const artifacts = [
      makeArtifact({ id: '1', status: ProofStatus.coach_signed_off }),
      makeArtifact({ id: '2', status: ProofStatus.admin_reviewed }),
      makeArtifact({ id: '3', status: ProofStatus.pending_review }),
      makeArtifact({ id: '4', status: ProofStatus.disputed }),
      makeArtifact({ id: '5', status: ProofStatus.flagged_abuse }),
      makeArtifact({ id: '6', status: ProofStatus.stale }),
    ];
    const ctx = svc.buildContext({ user_id: 'u-1', name: 'Test' }, artifacts);
    expect(ctx.authoritative_count).toBe(2);
    expect(ctx.pending_count).toBe(1);
    expect(ctx.flagged_count).toBe(2);
    expect(ctx.stale_count).toBe(1);
    expect(ctx.artifacts).toHaveLength(6);
  });

  it('exposes claimed_amount as a number, not Decimal', () => {
    const artifacts = [
      makeArtifact({ claimed_amount: new Prisma.Decimal('1234.56') }),
    ];
    const ctx = svc.buildContext({ user_id: 'u-1', name: 'Test' }, artifacts);
    expect(typeof ctx.artifacts[0].claimed_amount).toBe('number');
    expect(ctx.artifacts[0].claimed_amount).toBe(1234.56);
  });
});
