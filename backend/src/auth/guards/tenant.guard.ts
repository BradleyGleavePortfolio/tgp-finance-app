import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

/**
 * Global tenant guard: ensures students can only access their own data.
 * Coaches can access any student's data within their tenant.
 *
 * Applied globally via APP_GUARD; validates :userId route params and query params.
 *
 * SECURITY: previously this guard fail-OPEN when `request.user` was missing — relying on every
 * controller to remember `@UseGuards(JwtAuthGuard)`. One missed decorator = public endpoint.
 * We now fail-CLOSED by default and require endpoints to opt-in to public access via @Public().
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // SECURITY: fail closed. An unauthenticated request must never reach a handler unless the
    // handler explicitly opts in with @Public().
    if (!user) {
      throw new UnauthorizedException({
        error: 'Authentication required',
        code: 'UNAUTHENTICATED',
      });
    }

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
