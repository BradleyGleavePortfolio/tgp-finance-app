import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CoachPracticeType } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { RoleGuard } from '../../auth/guards/role.guard';
import { PracticeTypeService } from './practice-type.service';

const ALLOWED: CoachPracticeType[] = ['fitness_only', 'finance_only', 'both'];

/**
 * Stage-3 coach practice-selection endpoints (finance side).
 *
 *   GET  /api/coach/practice  — current value or `null`
 *   PUT  /api/coach/practice  — set or change; body `{ practice_type }`
 *
 * Coach/owner gated. The cross-pillar UI is hosted in the fitness app,
 * so the finance side does not enforce a `both` gate anywhere — this
 * controller is just storage for the coach's stated practice.
 */
@Controller('api/coach/practice')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles('coach')
export class PracticeTypeController {
  constructor(private readonly service: PracticeTypeService) {}

  @Get()
  get(@CurrentUser() user: { id: string }) {
    return this.service.get(user.id);
  }

  @Put()
  set(
    @CurrentUser() user: { id: string },
    @Body() body: { practice_type?: string } | undefined,
  ) {
    const v = body?.practice_type;
    if (!v || !(ALLOWED as string[]).includes(v)) {
      throw new BadRequestException({
        error: `practice_type must be one of: ${ALLOWED.join(', ')}`,
        code: 'INVALID_PRACTICE_TYPE',
      });
    }
    return this.service.set(user.id, v as CoachPracticeType);
  }
}
