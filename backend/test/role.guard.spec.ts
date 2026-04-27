import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RoleGuard } from '../src/auth/guards/role.guard';

function buildContext(request: any): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function reflectorWith(roles: string[] | undefined): any {
  return { getAllAndOverride: () => roles };
}

describe('RoleGuard', () => {
  it('lets owner through any role-gated route (OWNER bypass)', () => {
    const guard = new RoleGuard(reflectorWith(['coach']));
    const ctx = buildContext({ user: { id: 'owner-1', role: 'owner' } });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects student on a coach-only route', () => {
    const guard = new RoleGuard(reflectorWith(['coach']));
    const ctx = buildContext({ user: { id: 's-1', role: 'student' } });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('lets coach through a coach-only route', () => {
    const guard = new RoleGuard(reflectorWith(['coach']));
    const ctx = buildContext({ user: { id: 'c-1', role: 'coach' } });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('passes through when no roles required', () => {
    const guard = new RoleGuard(reflectorWith(undefined));
    const ctx = buildContext({ user: { id: 's-1', role: 'student' } });
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
