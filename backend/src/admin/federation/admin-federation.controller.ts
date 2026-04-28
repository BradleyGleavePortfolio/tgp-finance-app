import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { AdminFederationService } from './admin-federation.service';
import { ServiceTokenGuard } from './service-token.guard';

/**
 * AdminFederationController
 *
 * Cross-app federation surface consumed by the TGP admin console (hosted
 * inside the fitness backend). The console fans a single admin search out
 * to both backends and reconciles results by email.
 *
 * Auth model: this surface is **NOT** behind the user JWT. It is gated by
 * `ServiceTokenGuard`, which checks a shared `FEDERATION_SERVICE_TOKEN`
 * presented as a Bearer token. We mark the routes `@Public()` so the
 * global JwtAuthGuard does not also try to validate a Supabase JWT (the
 * fitness backend never has one to forward).
 *
 * The surface is read-only and returns aggregate / summary data. Anything
 * that mutates user state still goes through the existing /api/admin
 * routes which require an OWNER session.
 */
@Controller('api/admin/federation')
@Public()
@UseGuards(ServiceTokenGuard)
export class AdminFederationController {
  constructor(private readonly fed: AdminFederationService) {}

  /** Liveness + auth probe for the fitness backend's startup self-test. */
  @Get('health')
  health() {
    return {
      ok: true,
      service: 'tgp-finance',
      identityMapping: 'email',
      surface: 'admin-federation',
    };
  }

  /** Search by name or email. */
  @Get('users/search')
  search(@Query('q') q: string, @Query('limit') limit?: string) {
    const parsed = limit ? Number.parseInt(limit, 10) : 20;
    return this.fed.searchUsers(q ?? '', Number.isFinite(parsed) ? parsed : 20);
  }

  /** Client (student) finance summary by email. */
  @Get('clients/by-email/:email')
  client(@Param('email') email: string) {
    return this.fed.getClientSummaryByEmail(decodeURIComponent(email));
  }

  /** Coach (or owner) finance + business summary by email. */
  @Get('coaches/by-email/:email')
  coach(@Param('email') email: string) {
    return this.fed.getCoachSummaryByEmail(decodeURIComponent(email));
  }

  /** Aggregate product-usage metrics. */
  @Get('usage/product')
  usage() {
    return this.fed.getProductUsage();
  }
}
