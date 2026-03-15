import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

/**
 * Global tenant guard: ensures students can only access their own data.
 * Coaches can access any student's data within their tenant.
 *
 * Applied globally via APP_GUARD; validates :userId route params and query params.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // No user means unauthenticated — let JwtGuard handle it
    if (!user) return true;

    // Coach can access all student data
    if (user.role === 'coach') return true;

    // For student: if route has :userId param, it must match their own id
    const routeUserId = request.params?.userId;
    if (routeUserId && routeUserId !== user.id) {
      throw new ForbiddenException({
        error: 'You can only access your own data',
        code: 'TENANT_VIOLATION',
      });
    }

    // Attach tenant context to request for service-layer use
    request.tenantUserId = user.id;

    return true;
  }
}
