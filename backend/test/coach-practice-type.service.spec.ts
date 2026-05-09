// Stage 3 — coach practice-type storage tests (finance side).
//
// Finance is a pure storage participant for the practice type — the
// cross-pillar UI lives in the fitness app, so finance never gates
// anything on this value. The tests pin the same shape as the gpb
// equivalent so a future swap to a shared library stays trivial.

import { ForbiddenException } from '@nestjs/common';
import { PracticeTypeService } from '../src/coach/practice-type/practice-type.service';

function makePrisma(initial?: Partial<{ role: string; coach_practice_type: string | null }>) {
  const findUnique = jest.fn().mockResolvedValue(initial ?? null);
  const update = jest.fn().mockImplementation(async ({ data }) => ({
    coach_practice_type: data.coach_practice_type,
  }));
  return {
    findUnique,
    update,
    prisma: { user: { findUnique, update } } as any,
  };
}

describe('PracticeTypeService (finance) — get', () => {
  it('returns null practice_type for an unknown user', async () => {
    const { prisma } = makePrisma(undefined);
    const svc = new PracticeTypeService(prisma);
    await expect(svc.get('missing')).resolves.toEqual({ practice_type: null });
  });

  it('returns the stored value for a coach who has selected', async () => {
    const { prisma } = makePrisma({ role: 'coach', coach_practice_type: 'finance_only' });
    const svc = new PracticeTypeService(prisma);
    await expect(svc.get('coach-1')).resolves.toEqual({ practice_type: 'finance_only' });
  });

  it('throws ForbiddenException for a student', async () => {
    const { prisma } = makePrisma({ role: 'student', coach_practice_type: null });
    const svc = new PracticeTypeService(prisma);
    await expect(svc.get('student-1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('PracticeTypeService (finance) — set', () => {
  it('persists for a coach', async () => {
    const { prisma, update } = makePrisma({ role: 'coach', coach_practice_type: null });
    const svc = new PracticeTypeService(prisma);
    const result = await svc.set('coach-1', 'both');
    expect(result).toEqual({ practice_type: 'both' });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'coach-1' },
        data: { coach_practice_type: 'both' },
      }),
    );
  });

  it('refuses to set on a student', async () => {
    const { prisma, update } = makePrisma({ role: 'student', coach_practice_type: null });
    const svc = new PracticeTypeService(prisma);
    await expect(svc.set('student-1', 'fitness_only')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(update).not.toHaveBeenCalled();
  });
});
