import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { AdminFederationService } from './admin-federation.service';
import { ServiceTokenGuard } from './service-token.guard';
import type { CoachPracticeType } from '@prisma/client';

const ALLOWED_PRACTICE: CoachPracticeType[] = ['fitness_only', 'finance_only', 'both'];

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

  /**
   * Sprint A — symmetric practice-type write surface.
   *
   * The fitness backend forwards a coach's practice selection here so the
   * value lands on both backends in a single user action. Only mutates the
   * `coach_practice_type` column on the matched User row; never touches
   * anything else. Returns the resulting value or 404 if no coach is
   * mapped to that email on the finance side (operator must promote
   * them on finance first — surface intentionally does NOT auto-create).
   */
  @Put('coaches/by-email/:email/practice')
  async setPractice(
    @Param('email') emailParam: string,
    @Body() body: { practice_type?: string } | undefined,
  ) {
    const email = decodeURIComponent(emailParam);
    const v = body?.practice_type;
    if (!v || !(ALLOWED_PRACTICE as string[]).includes(v)) {
      throw new BadRequestException({
        error: `practice_type must be one of: ${ALLOWED_PRACTICE.join(', ')}`,
        code: 'INVALID_PRACTICE_TYPE',
      });
    }
    return this.fed.setCoachPracticeByEmail(email, v as CoachPracticeType);
  }
}
