import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

/**
 * ClientCoachLinkedGuard
 *
 * Phase 1C gate: enforces "a client (role=student) must be attached to a
 * coach before they can use client-only data routes." Behavior is gated by
 * the FEATURE_REQUIRE_COACH_CODE env flag so the rollout can be staged:
 *
 *   FEATURE_REQUIRE_COACH_CODE != 'true' -> guard is a no-op (legacy users
 *     keep working). The auth.service register endpoint also won't reject
 *     codeless signups in this mode.
 *
 *   FEATURE_REQUIRE_COACH_CODE == 'true' -> any authenticated student
 *     without coach_id is forced to call /api/invites/attach first; the
 *     auth.service register endpoint also requires `invite_code` in the body.
 *
 * Always allowed (regardless of flag):
 *   - @Public() routes (e.g. /api/auth/login, /health)
 *   - coach + owner roles
 *   - whitelisted "let me get linked" paths (auth/me, invites/*, logout)
 *
 * The whitelist exists because a freshly-created Google-OAuth user lands
 * with role=student + coach_id=null; they must be able to call /api/auth/me
 * (so the mobile app can render onboarding) and POST /api/invites/attach
 * without being blocked by this guard.
 */
const ALLOWED_PATH_PREFIXES = [
  '/api/auth/me',
  '/api/auth/logout',
  '/api/auth/select-role',
  '/api/invites',
];

@Injectable()
export class ClientCoachLinkedGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.config.get<string>('FEATURE_REQUIRE_COACH_CODE');
    const enabled = required === 'true' || required === '1';
    if (!enabled) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) return true; // JwtAuthGuard already failed/passed; not our job.

    // Coaches and owners are exempt.
    if (user.role === 'coach' || user.role === 'owner') return true;

    // Allow the linking-related routes through even for unattached clients.
    const url: string = req.url || req.originalUrl || '';
    const path = url.split('?')[0];
    if (ALLOWED_PATH_PREFIXES.some((p) => path === p || path.startsWith(p + '/'))) {
      return true;
    }

    if (!user.coach_id) {
      throw new ForbiddenException({
        error: 'Your account is not linked to a coach yet. Enter your coach invite code to continue.',
        code: 'COACH_LINK_REQUIRED',
      });
    }

    return true;
  }
}
