import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { RoleGuard } from '../../auth/guards/role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { InviteCodesService } from './invite-codes.service';
import { CreateInviteCodeSchema } from './invite-codes.dto';

/**
 * Sprint A — coach-issued invite-code CRUD.
 *
 * Mirrors the fitness backend's contract so the mobile screen ports
 * cleanly:
 *
 *   POST   /api/coach/invite-codes              create
 *   GET    /api/coach/invite-codes              list mine
 *   DELETE /api/coach/invite-codes/:id          revoke
 *
 * RoleGuard + @Roles('coach') gate write paths to coach (or owner via
 * RoleGuard's owner-bypass). Throttle is tighter on writes — a single
 * coach should never need >30 codes/min.
 */
@Controller('api/coach/invite-codes')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles('coach')
export class InviteCodesController {
  constructor(private readonly service: InviteCodesService) {}

  @Post()
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  async create(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    const parsed = CreateInviteCodeSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.service.createForCoach(user.id, parsed.data);
  }

  @Get()
  async list(@CurrentUser() user: { id: string }) {
    return this.service.listForCoach(user.id);
  }

  @Delete(':id')
  async revoke(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.service.revokeForCoach(user.id, id);
  }
}
