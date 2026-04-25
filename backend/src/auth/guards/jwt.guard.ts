import { Injectable, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

/**
 * JWT auth guard.
 *
 * Registered globally via APP_GUARD in app.module.ts so EVERY route is
 * authenticated by default. Routes that must be reachable without a JWT
 * (e.g. /health, /api/auth/login, /api/auth/register) opt out with `@Public()`.
 *
 * Previously this guard had to be re-applied per-controller via
 * `@UseGuards(JwtAuthGuard)` — one missed decorator = public endpoint. Now
 * the failure mode is reversed: forgetting `@Public()` on an intentionally
 * public route surfaces immediately in tests, while forgetting auth on a
 * private route is impossible because auth is the default.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
