import { timingSafeEqual } from 'crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * ServiceTokenGuard
 *
 * Service-to-service auth for the cross-app admin federation surface.
 * The TGP admin console is hosted in the fitness backend; that backend calls
 * into this one with a shared secret on every federation request:
 *
 *   Authorization: Bearer <FEDERATION_SERVICE_TOKEN>
 *
 * This guard is the only thing protecting the federation routes — they are
 * intentionally @Public() so the global JwtAuthGuard does not also try to
 * verify a Supabase user JWT against a service token. The federation surface
 * never exposes per-user mutable actions; it is read-only summaries.
 *
 * Operational rules:
 *   - If FEDERATION_SERVICE_TOKEN is unset, every request fails with 503 so
 *     a misconfigured deploy cannot accidentally run with the surface open.
 *   - Token comparison is timing-safe to defeat byte-by-byte probing.
 *   - The presented token must be at least 32 chars; shorter values are
 *     rejected before any comparison so trivially short secrets cannot be
 *     used by mistake.
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('FEDERATION_SERVICE_TOKEN');
    if (!expected || expected.length < 32) {
      throw new ServiceUnavailableException({
        error: 'Admin federation is not configured on this deployment',
        code: 'FEDERATION_DISABLED',
      });
    }

    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    if (!header || typeof header !== 'string') {
      throw new UnauthorizedException({
        error: 'Missing service token',
        code: 'FEDERATION_UNAUTHENTICATED',
      });
    }

    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    const presented = match ? match[1].trim() : '';
    if (!presented || presented.length < 32) {
      throw new UnauthorizedException({
        error: 'Invalid service token',
        code: 'FEDERATION_UNAUTHENTICATED',
      });
    }

    if (!constantTimeEqual(presented, expected)) {
      throw new UnauthorizedException({
        error: 'Invalid service token',
        code: 'FEDERATION_UNAUTHENTICATED',
      });
    }

    return true;
  }
}

export function constantTimeEqual(a: string, b: string): boolean {
  // timingSafeEqual requires equal-length buffers, so we hash to a fixed
  // length first via Buffer.from with a length cap. Shortcut: if lengths
  // differ, run a constant-time compare on a padded copy so the early-exit
  // does not leak length.
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  const len = Math.max(ba.length, bb.length);
  const pa = Buffer.alloc(len);
  const pb = Buffer.alloc(len);
  ba.copy(pa);
  bb.copy(pb);
  const eq = timingSafeEqual(pa, pb);
  return eq && ba.length === bb.length;
}
