import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { TenantGuard } from '../src/auth/guards/tenant.guard';

function buildContext(request: any): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('TenantGuard', () => {
  let guard: TenantGuard;

  beforeEach(() => {
    guard = new TenantGuard({ getAllAndOverride: () => false } as any);
  });

  it('forbids a student from reading another user via :userId route param', () => {
    const ctx = buildContext({
      user: { id: 'student-a', role: 'student' },
      params: { userId: 'student-b' },
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows a student to access their own :userId', () => {
    const request: any = {
      user: { id: 'student-a', role: 'student' },
      params: { userId: 'student-a' },
    };
    const ctx = buildContext(request);
    expect(guard.canActivate(ctx)).toBe(true);
    expect(request.tenantUserId).toBe('student-a');
  });

  it('allows a coach to access any student data', () => {
    const ctx = buildContext({
      user: { id: 'coach-1', role: 'coach' },
      params: { userId: 'student-b' },
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
