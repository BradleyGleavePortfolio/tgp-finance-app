import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RoleGuard } from '../auth/guards/role.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminService } from './admin.service';

// Locally scoped — only used by admin endpoints, no need to publish to the
// shared schemas.ts file.
const PromoteSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(['coach', 'owner']),
});

/**
 * AdminController
 *
 * OWNER-only endpoints. RoleGuard short-circuits for OWNER on every gated
 * route, so listing `@Roles('owner')` is redundant in practice — but we still
 * declare it explicitly so the intent is greppable from the route definition
 * and so a future change to the OWNER bypass doesn't silently open these up.
 */
@Controller('api/admin')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles('owner')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('promote')
  async promote(@Body() body: any) {
    const parsed = PromoteSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.adminService.promoteUser(parsed.data.user_id, parsed.data.role);
  }

  @Get('coaches')
  async listCoaches() {
    return this.adminService.listCoaches();
  }

  @Get('coaches/:id')
  async coachDetail(@Param('id') id: string) {
    return this.adminService.getCoachDetail(id);
  }

  // ---------------------------------------------------------------------------
  // Admin console bridge — endpoints below back the Healthie/EHR-style admin
  // console hosted in the fitness app. OWNER-only via class-level guard.
  // See AdminService comment block for the email-as-join-key contract.
  // ---------------------------------------------------------------------------

  /**
   * GET /api/admin/search?q=<term>&limit=<n>
   * Free-text search across all users (coach OR client) by email or name.
   */
  @Get('search')
  async searchUsers(
    @Query('q') q: string | undefined,
    @Query('limit') limit: string | undefined,
  ) {
    const parsedLimit = limit ? Number(limit) : 25;
    if (Number.isNaN(parsedLimit)) {
      throw new BadRequestException({
        error: 'limit must be a number',
        code: 'VALIDATION_ERROR',
      });
    }
    return this.adminService.searchUsers(q ?? '', parsedLimit);
  }

  /** GET /api/admin/clients/:id/finance-summary */
  @Get('clients/:id/finance-summary')
  async clientFinanceSummary(@Param('id') id: string) {
    return this.adminService.getClientFinanceSummary(id);
  }

  /**
   * GET /api/admin/clients/by-email?email=<e>
   * Convenience join via email — see AdminService for the identity contract.
   * Returns 404 IDENTITY_NOT_LINKED when no finance account is on file.
   */
  @Get('clients/by-email')
  async clientFinanceSummaryByEmail(@Query('email') email: string | undefined) {
    return this.adminService.getClientFinanceSummaryByEmail(email ?? '');
  }

  /** GET /api/admin/coaches/:id/finance-summary */
  @Get('coaches/:id/finance-summary')
  async coachFinanceSummary(@Param('id') id: string) {
    return this.adminService.getCoachFinanceSummary(id);
  }
}
