import {
  Controller, Get, Post, Body, UseGuards, BadRequestException,
} from '@nestjs/common';
import { AccountabilityService } from './accountability.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RoleGuard } from '../auth/guards/role.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PairAccountabilitySchema } from '../common/validators/schemas';

@Controller('api/accountability')
@UseGuards(JwtAuthGuard)
export class AccountabilityController {
  constructor(private readonly accountabilityService: AccountabilityService) {}

  @Get('partner')
  async getPartner(@CurrentUser() user: any) {
    return this.accountabilityService.getPartner(user.id);
  }

  @Post('pair')
  @UseGuards(RoleGuard)
  @Roles('coach')
  async pairStudents(@Body() body: any, @CurrentUser() user: any) {
    const parsed = PairAccountabilitySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.accountabilityService.pairStudents(
      user.id,
      parsed.data.student_id_1,
      parsed.data.student_id_2,
      user.role,
    );
  }
}
