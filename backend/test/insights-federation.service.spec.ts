// test/insights-federation.service.spec.ts
//
// Sprint B-3 — finance federation for Holistic Insights v1.
//
// Coverage:
//   1. Empty EOD list returns weeks=[] (backend correctly reports
//      insufficient_data in this case).
//   2. Multi-week EOD series produces an ordered, deduplicated set of
//      weekKeys (one row per ISO week, last EOD of the week wins).
//   3. monthly_income_gross drives savings_rate_pct and debt_to_income;
//      a null/zero income produces zero in both (the engine drops
//      zero-variance series).
//   4. Bounds clamping: savings_rate_pct in [0, 100]; debt_to_income in
//      [0, 5]; spending_kusd never negative.
//
// Service is exercised directly with a thin Prisma stub — same posture
// as the other federation specs in this directory.

import 'reflect-metadata';
import { InsightsFederationService } from '../src/admin/federation/insights-federation.service';

function makeService() {
  // Only the methods the service touches are stubbed. The full
  // PrismaService surface is huge; this keeps the spec readable.
  const prisma = {
    user: { findFirst: jest.fn() },
    financialProfile: { findUnique: jest.fn() },
    eODSubmission: { findMany: jest.fn() },
  } as never;
  return { svc: new InsightsFederationService(prisma), prisma };
}

function dec(n: number) {
  // Prisma.Decimal-like stub that responds to toString(). The service
  // only calls toString() on the value, so this is sufficient.
  return { toString: () => String(n) } as never;
}

describe('InsightsFederationService.buildWeeklySeries', () => {
  it('returns an empty array when no EODs are present', () => {
    const { svc } = makeService();
    const weeks = svc.buildWeeklySeries([], 5000);
    expect(weeks).toEqual([]);
  });

  it('emits one row per ISO week, last EOD of the week wins', () => {
    const { svc } = makeService();
    const eods = [
      // Week A: two EODs, the later one should be kept.
      {
        submission_date: new Date('2026-04-13T08:00:00Z'),
        total_cash_computed: dec(1000),
        total_debt_computed: dec(0),
      },
      {
        submission_date: new Date('2026-04-15T08:00:00Z'),
        total_cash_computed: dec(1200),
        total_debt_computed: dec(0),
      },
      // Week B
      {
        submission_date: new Date('2026-04-20T08:00:00Z'),
        total_cash_computed: dec(1300),
        total_debt_computed: dec(0),
      },
    ];
    const weeks = svc.buildWeeklySeries(eods, 4345); // 4345/4.345 = 1000 weekly income share
    expect(weeks).toHaveLength(2);
    // Cash on the week-A row is the LATER EOD's value (1200), not 1000.
    // We test it indirectly: the savings_rate_pct on week B is computed
    // against the cash delta 1300-1200 = 100, divisor 1000 → 10%.
    expect(weeks[1]?.savings_rate_pct).toBeCloseTo(10, 5);
  });

  it('clamps savings_rate_pct to [0, 100] and spending_kusd is non-negative', () => {
    const { svc } = makeService();
    const eods = [
      {
        submission_date: new Date('2026-04-13T08:00:00Z'),
        total_cash_computed: dec(1000),
        total_debt_computed: dec(0),
      },
      // Huge positive cash delta — savings would be 500% before clamp.
      {
        submission_date: new Date('2026-04-20T08:00:00Z'),
        total_cash_computed: dec(6000),
        total_debt_computed: dec(0),
      },
      // Negative cash delta — spending should be positive.
      {
        submission_date: new Date('2026-04-27T08:00:00Z'),
        total_cash_computed: dec(3000),
        total_debt_computed: dec(0),
      },
    ];
    const weeks = svc.buildWeeklySeries(eods, 4345); // weekly share ~1000
    const week2 = weeks[1];
    const week3 = weeks[2];
    expect(week2?.savings_rate_pct).toBeLessThanOrEqual(100);
    expect(week2?.savings_rate_pct).toBeGreaterThanOrEqual(0);
    expect(week3?.spending_kusd).toBeGreaterThanOrEqual(0);
  });

  it('returns 0 for savings_rate_pct and debt_to_income when monthly income is null', () => {
    const { svc } = makeService();
    const eods = [
      {
        submission_date: new Date('2026-04-13T08:00:00Z'),
        total_cash_computed: dec(1000),
        total_debt_computed: dec(50000),
      },
      {
        submission_date: new Date('2026-04-20T08:00:00Z'),
        total_cash_computed: dec(1500),
        total_debt_computed: dec(50000),
      },
    ];
    const weeks = svc.buildWeeklySeries(eods, null);
    expect(weeks).toHaveLength(2);
    weeks.forEach((w) => {
      expect(w.savings_rate_pct).toBe(0);
      expect(w.debt_to_income).toBe(0);
    });
  });

  it('clamps debt_to_income to [0, 5]', () => {
    const { svc } = makeService();
    const eods = [
      {
        submission_date: new Date('2026-04-13T08:00:00Z'),
        total_cash_computed: dec(0),
        total_debt_computed: dec(1_000_000),
      },
    ];
    const weeks = svc.buildWeeklySeries(eods, 1000); // DTI would be 1000 before clamp
    expect(weeks[0]?.debt_to_income).toBe(5);
  });
});

describe('InsightsFederationService.getFinanceSummary', () => {
  it('throws NotFoundException when no user matches the email', async () => {
    const { svc, prisma } = makeService();
    (prisma as { user: { findFirst: jest.Mock } }).user.findFirst.mockResolvedValue(null);
    await expect(svc.getFinanceSummary('ghost@example.com', 90)).rejects.toThrow();
  });

  it('returns an empty weeks array when the user has no EODs in the window', async () => {
    const { svc, prisma } = makeService();
    const p = prisma as {
      user: { findFirst: jest.Mock };
      financialProfile: { findUnique: jest.Mock };
      eODSubmission: { findMany: jest.Mock };
    };
    p.user.findFirst.mockResolvedValue({ id: 'u-1' });
    p.financialProfile.findUnique.mockResolvedValue({
      monthly_income_gross: dec(5000),
    });
    p.eODSubmission.findMany.mockResolvedValue([]);
    const out = await svc.getFinanceSummary('a@b.com', 90);
    expect(out.weeks).toEqual([]);
    expect(typeof out.generated_at).toBe('string');
  });
});
