import { ExecutionContext, ForbiddenException, BadRequestException } from '@nestjs/common';
import { OwnsStudentGuard } from '../src/auth/guards/owns-student.guard';

function buildContext(request: any): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('OwnsStudentGuard', () => {
  it('rejects callers that are neither coach nor owner', async () => {
    const prisma: any = { user: { findUnique: jest.fn() } };
    const guard = new OwnsStudentGuard(prisma);
    const ctx = buildContext({ user: { id: 's-1', role: 'student' }, params: { id: 'x' } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects when student id is missing', async () => {
    const prisma: any = { user: { findUnique: jest.fn() } };
    const guard = new OwnsStudentGuard(prisma);
    const ctx = buildContext({ user: { id: 'c-1', role: 'coach' }, params: {} });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lets coach through when student belongs to them', async () => {
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'student-a',
          coach_id: 'c-1',
          role: 'student',
        }),
      },
    };
    const guard = new OwnsStudentGuard(prisma);
    const req = { user: { id: 'c-1', role: 'coach' }, params: { student_id: 'student-a' } };
    const ctx = buildContext(req);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect((req as any).ownedStudent).toBeDefined();
  });

  it('rejects coach when student belongs to a different coach', async () => {
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'student-a',
          coach_id: 'OTHER',
          role: 'student',
        }),
      },
    };
    const guard = new OwnsStudentGuard(prisma);
    const ctx = buildContext({
      user: { id: 'c-1', role: 'coach' },
      params: { student_id: 'student-a' },
    });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('OWNER bypass: allows owner to act on any student', async () => {
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'student-a',
          coach_id: 'some-other-coach',
          role: 'student',
        }),
      },
    };
    const guard = new OwnsStudentGuard(prisma);
    const ctx = buildContext({
      user: { id: 'owner-1', role: 'owner' },
      params: { student_id: 'student-a' },
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('OWNER bypass still rejects when target is not a student', async () => {
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'coach-x',
          coach_id: null,
          role: 'coach',
        }),
      },
    };
    const guard = new OwnsStudentGuard(prisma);
    const ctx = buildContext({
      user: { id: 'owner-1', role: 'owner' },
      params: { student_id: 'coach-x' },
    });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
