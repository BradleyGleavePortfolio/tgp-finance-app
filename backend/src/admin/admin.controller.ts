import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
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
  async promote(@Body() body: unknown) {
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
}
