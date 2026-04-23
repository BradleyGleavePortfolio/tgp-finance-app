import { NotFoundException } from '@nestjs/common';
import { CoachService } from '../src/coach/coach.service';

describe('CoachService', () => {
  describe('getStudentDetailWithHistory — ownership check', () => {
    it('throws NotFoundException when the student does not exist', async () => {
      const prisma = {
        user: { findUnique: jest.fn().mockResolvedValue(null) },
      } as any;
      const svc = new CoachService(prisma);
      await expect(svc.getStudentDetailWithHistory('coach-1', 'student-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when student.coach_id does not match', async () => {
      const prisma = {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'student-b',
            coach_id: 'coach-other',
            profile: null,
            accounts: [],
          }),
        },
      } as any;
      const svc = new CoachService(prisma);
      await expect(svc.getStudentDetailWithHistory('coach-1', 'student-b')).rejects.toMatchObject({
        response: { error: 'Access denied', code: 'FORBIDDEN' },
      });
    });
  });

  describe('applyTemplate — template ownership', () => {
    it('refuses to apply a template owned by a different coach', async () => {
      const prisma = {
        programTemplate: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'tpl-1',
            coach_id: 'coach-other',
            name: 'Phase 1',
            phases: [],
          }),
        },
        coachNote: { create: jest.fn() },
        financialProfile: { updateMany: jest.fn() },
      } as any;
      const svc = new CoachService(prisma);
      await expect(svc.applyTemplate('coach-1', 'tpl-1', 'student-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.coachNote.create).not.toHaveBeenCalled();
      expect(prisma.financialProfile.updateMany).not.toHaveBeenCalled();
    });
  });
});
