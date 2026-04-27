import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      throw new ForbiddenException({ error: 'Authentication required', code: 'UNAUTHORIZED' });
    }

    // OWNER bypass: an owner is the platform-wide admin and can access any
    // role-gated endpoint. We never want to add `owner` to every @Roles(...)
    // call site, so the guard short-circuits for them here.
    if (user.role === 'owner') return true;

    const hasRole = requiredRoles.includes(user.role);

    if (!hasRole) {
      throw new ForbiddenException({
        error: `Access denied. Required role: ${requiredRoles.join(' or ')}`,
        code: 'FORBIDDEN_ROLE',
      });
    }

    return true;
  }
}
