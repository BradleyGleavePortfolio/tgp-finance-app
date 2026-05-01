import {
  ProofProvenanceExportSchema,
  PROOF_KIND_VALUES,
  PROOF_STATUS_VALUES,
  bandForStatus,
  correlationIdFor,
  countByBand,
  type ProofProvenanceExport,
  type ProofStatusValue,
} from '../src/ai-gateway/proof-provenance-export';

describe('bandForStatus — proof.AUTHORITATIVE_STATUSES alignment', () => {
  it('maps coach_signed_off and admin_reviewed to authoritative', () => {
    expect(bandForStatus('coach_signed_off')).toBe('authoritative');
    expect(bandForStatus('admin_reviewed')).toBe('authoritative');
  });

  it('maps pending_review to pending', () => {
    expect(bandForStatus('pending_review')).toBe('pending');
  });

  it('maps every other status to non_authoritative', () => {
    const nonAuthoritative: ProofStatusValue[] = [
      'coach_rejected',
      'disputed',
      'flagged_abuse',
      'stale',
      'superseded',
    ];
    for (const s of nonAuthoritative) {
      expect(bandForStatus(s)).toBe('non_authoritative');
    }
  });

  it('covers every PROOF_STATUS_VALUES entry without falling through', () => {
    for (const s of PROOF_STATUS_VALUES) {
      // bandForStatus is exhaustive; an unhandled status would throw at
      // runtime via the switch's lack of default. This loop proves
      // coverage stays in sync if a new status is added upstream.
      expect(['authoritative', 'pending', 'non_authoritative']).toContain(
        bandForStatus(s),
      );
    }
  });
});

describe('correlationIdFor', () => {
  it('returns a 32-char hex slice', () => {
    const id = correlationIdFor('art-1', 'salt');
    expect(id).toMatch(/^[a-f0-9]{32}$/);
  });

  it('is deterministic for the same inputs', () => {
    expect(correlationIdFor('art-1', 'salt')).toBe(
      correlationIdFor('art-1', 'salt'),
    );
  });

  it('changes when the artifact id changes', () => {
    expect(correlationIdFor('art-1', 'salt')).not.toBe(
      correlationIdFor('art-2', 'salt'),
    );
  });

  it('changes when the salt rotates', () => {
    expect(correlationIdFor('art-1', 'salt-a')).not.toBe(
      correlationIdFor('art-1', 'salt-b'),
    );
  });

  it('rejects empty inputs (defence-in-depth)', () => {
    expect(() => correlationIdFor('', 'salt')).toThrow();
    expect(() => correlationIdFor('art', '')).toThrow();
  });

  it('does not leak the artifact id (one-way)', () => {
    const id = correlationIdFor('user-secret-id', 'salt');
    expect(id).not.toContain('user-secret-id');
    expect(id).not.toContain('user');
    expect(id).not.toContain('secret');
  });
});

describe('ProofProvenanceExportSchema', () => {
  const valid = (): ProofProvenanceExport => ({
    correlation_id: correlationIdFor('art-1', 'salt'),
    kind: 'net_worth_milestone',
    band: 'authoritative',
    source: 'coach_entered',
    occurred_at: '2026-04-15',
    display_amount: '$42,500.00',
    currency: 'USD',
    updated_at: new Date().toISOString(),
  });

  it('accepts a fully-formed export row', () => {
    expect(ProofProvenanceExportSchema.parse(valid())).toBeTruthy();
  });

  it('rejects extra keys (strict)', () => {
    const r = ProofProvenanceExportSchema.safeParse({
      ...valid(),
      proof_id: 'should-not-be-here',
    });
    expect(r.success).toBe(false);
  });

  it('accepts null display_amount and currency for non-money kinds', () => {
    expect(
      ProofProvenanceExportSchema.parse({
        ...valid(),
        kind: 'self_report',
        display_amount: null,
        currency: null,
      }),
    ).toBeTruthy();
  });

  it('rejects non-ISO occurred_at', () => {
    const r = ProofProvenanceExportSchema.safeParse({
      ...valid(),
      occurred_at: 'yesterday',
    });
    expect(r.success).toBe(false);
  });

  it('exposes the full PROOF_KIND_VALUES list (mirrors proof enum)', () => {
    expect(PROOF_KIND_VALUES).toContain('net_worth_milestone');
    expect(PROOF_KIND_VALUES).toContain('milestone_review');
    expect(PROOF_KIND_VALUES).toHaveLength(11);
  });
});

describe('countByBand', () => {
  const make = (band: 'authoritative' | 'pending' | 'non_authoritative'): ProofProvenanceExport => ({
    correlation_id: 'c1',
    kind: 'self_report',
    band,
    source: 'self_report',
    occurred_at: '2026-04-15',
    display_amount: null,
    currency: null,
    updated_at: new Date().toISOString(),
  });

  it('zeros out for an empty list', () => {
    expect(countByBand([])).toEqual({
      authoritative: 0,
      pending: 0,
      non_authoritative: 0,
    });
  });

  it('counts by band', () => {
    const c = countByBand([
      make('authoritative'),
      make('authoritative'),
      make('pending'),
      make('non_authoritative'),
    ]);
    expect(c).toEqual({
      authoritative: 2,
      pending: 1,
      non_authoritative: 1,
    });
  });
});
