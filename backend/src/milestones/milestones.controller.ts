import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { MilestonesService } from './milestones.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('api/milestones')
@UseGuards(JwtAuthGuard)
export class MilestonesController {
  constructor(private readonly milestonesService: MilestonesService) {}

  @Get()
  async getMilestones(@CurrentUser() user: CurrentUser) {
    return this.milestonesService.getMilestones(user.id);
  }

  @Post('check')
  async checkMilestones(@CurrentUser() user: CurrentUser) {
    return this.milestonesService.checkAndUnlockMilestones(user.id);
  }

  @Post(':key/celebrate')
  async markCelebrated(@Param('key') key: string, @CurrentUser() user: CurrentUser) {
    return this.milestonesService.markCelebrated(user.id, key);
  }
}
