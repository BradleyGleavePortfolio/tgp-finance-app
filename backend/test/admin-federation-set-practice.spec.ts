// Sprint A — finance-side practice federation write.
//
// Pins the symmetric-write contract: the fitness backend posts to
// /api/admin/federation/coaches/by-email/:email/practice (gated by
// FEDERATION_SERVICE_TOKEN) and the finance side updates the matching
// coach. Refuses to auto-create.

import { NotFoundException } from '@nestjs/common';
import { AdminFederationService } from '../src/admin/federation/admin-federation.service';

function makePrisma(user: { id: string; email: string; role: string } | null) {
  return {
    user: {
      findFirst: jest.fn().mockResolvedValue(user),
      update: jest
        .fn()
        .mockImplementation(async ({ data }: { data: { coach_practice_type: string } }) => ({
          coach_practice_type: data.coach_practice_type,
        })),
    },
  } as any;
}

describe('AdminFederationService.setCoachPracticeByEmail', () => {
  it('updates the matched coach and returns the new value', async () => {
    const prisma = makePrisma({ id: 'coach-1', email: 'a@example.com', role: 'coach' });
    const svc = new AdminFederationService(prisma);
    const out = await svc.setCoachPracticeByEmail('a@example.com', 'both' as any);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'coach-1' },
        data: { coach_practice_type: 'both' },
      }),
    );
    expect(out.practice_type).toBe('both');
  });

  it('also accepts the owner role', async () => {
    const prisma = makePrisma({ id: 'owner-1', email: 'o@example.com', role: 'owner' });
    const svc = new AdminFederationService(prisma);
    const out = await svc.setCoachPracticeByEmail('o@example.com', 'finance_only' as any);
    expect(out.practice_type).toBe('finance_only');
  });

  it('404s when no user is mapped to the email', async () => {
    const prisma = makePrisma(null);
    const svc = new AdminFederationService(prisma);
    await expect(
      svc.setCoachPracticeByEmail('missing@example.com', 'both' as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to mutate non-coach users (no auto-promote)', async () => {
    const prisma = makePrisma({ id: 'student-1', email: 's@example.com', role: 'student' });
    const svc = new AdminFederationService(prisma);
    await expect(
      svc.setCoachPracticeByEmail('s@example.com', 'fitness_only' as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
