// Sprint A audit fix coach #7 — coach_promotion_audits retention tests.

import { CoachPromotionAuditScheduler } from '../src/auth/coach-promotion-audit.scheduler';

function makePrisma() {
  const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
  return {
    deleteMany,
    prisma: { coachPromotionAudit: { deleteMany } } as any,
  };
}

describe('CoachPromotionAuditScheduler.prune', () => {
  const NOW = new Date('2026-05-09T03:15:00Z');

  it('prunes non-success rows older than 90 days', async () => {
    const { prisma, deleteMany } = makePrisma();
    deleteMany.mockResolvedValueOnce({ count: 7 }).mockResolvedValueOnce({ count: 0 });

    const scheduler = new CoachPromotionAuditScheduler(prisma);
    const result = await scheduler.prune(NOW);

    expect(deleteMany).toHaveBeenNthCalledWith(1, {
      where: {
        outcome: { in: ['invalid_token', 'invalid_role', 'rate_limited'] },
        created_at: {
          lt: new Date(NOW.getTime() - 90 * 24 * 60 * 60 * 1000),
        },
      },
    });
    expect(result.non_success_pruned).toBe(7);
  });

  it('prunes already_coach rows older than 365 days', async () => {
    const { prisma, deleteMany } = makePrisma();
    deleteMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 3 });

    const scheduler = new CoachPromotionAuditScheduler(prisma);
    const result = await scheduler.prune(NOW);

    expect(deleteMany).toHaveBeenNthCalledWith(2, {
      where: {
        outcome: 'already_coach',
        created_at: {
          lt: new Date(NOW.getTime() - 365 * 24 * 60 * 60 * 1000),
        },
      },
    });
    expect(result.already_coach_pruned).toBe(3);
  });

  it('never prunes success rows (compliance trail)', async () => {
    const { prisma, deleteMany } = makePrisma();
    const scheduler = new CoachPromotionAuditScheduler(prisma);
    await scheduler.prune(NOW);
    // Both deleteMany calls are scoped — neither targets `success`.
    for (const call of deleteMany.mock.calls) {
      const where = call[0].where;
      const matchesSuccess =
        where.outcome === 'success' ||
        (Array.isArray(where.outcome?.in) &&
          where.outcome.in.includes('success'));
      expect(matchesSuccess).toBe(false);
    }
  });
});
