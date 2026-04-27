import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { AccountabilityService } from '../src/accountability/accountability.service';

describe('AccountabilityService.pairStudents', () => {
  function makePrisma(s1: any, s2: any) {
    return {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(s1)
          .mockResolvedValueOnce(s2),
        update: jest.fn().mockResolvedValue({}),
      },
    } as any;
  }

  it('rejects same-id pair', async () => {
    const svc = new AccountabilityService({} as any);
    await expect(svc.pairStudents('c-1', 'a', 'a')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when one student is missing', async () => {
    const prisma = makePrisma(null, { id: 'b', role: 'student', coach_id: 'c-1' });
    const svc = new AccountabilityService(prisma);
    await expect(svc.pairStudents('c-1', 'a', 'b')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('SECURITY: rejects when one of the students belongs to a different coach', async () => {
    // This is the cross-tenant write bug. Before the fix, a coach could pair a
    // student from another coach's roster — overwriting their accountability_pair.
    const s1 = { id: 'a', role: 'student', coach_id: 'c-1', name: 'A' };
    const s2 = { id: 'b', role: 'student', coach_id: 'OTHER', name: 'B' };
    const prisma = makePrisma(s1, s2);
    const svc = new AccountabilityService(prisma);
    await expect(svc.pairStudents('c-1', 'a', 'b')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects pairing a non-student target', async () => {
    const s1 = { id: 'a', role: 'student', coach_id: 'c-1', name: 'A' };
    const s2 = { id: 'b', role: 'coach', coach_id: null, name: 'B' };
    const prisma = makePrisma(s1, s2);
    const svc = new AccountabilityService(prisma);
    await expect(svc.pairStudents('c-1', 'a', 'b')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('pairs two students owned by the calling coach', async () => {
    const s1 = { id: 'a', role: 'student', coach_id: 'c-1', name: 'A' };
    const s2 = { id: 'b', role: 'student', coach_id: 'c-1', name: 'B' };
    const prisma = makePrisma(s1, s2);
    const svc = new AccountabilityService(prisma);
    const out = await svc.pairStudents('c-1', 'a', 'b');
    expect(out.pair).toEqual(['a', 'b']);
    expect(prisma.user.update).toHaveBeenCalledTimes(2);
  });

  it('OWNER bypass: allows pairing across tenants', async () => {
    const s1 = { id: 'a', role: 'student', coach_id: 'c-1', name: 'A' };
    const s2 = { id: 'b', role: 'student', coach_id: 'c-2', name: 'B' };
    const prisma = makePrisma(s1, s2);
    const svc = new AccountabilityService(prisma);
    const out = await svc.pairStudents('owner-1', 'a', 'b', 'owner');
    expect(out.pair).toEqual(['a', 'b']);
    expect(prisma.user.update).toHaveBeenCalledTimes(2);
  });
});
