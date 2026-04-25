import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { PrioritiesService } from './priorities.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RoleGuard } from '../auth/guards/role.guard';

@Controller('api/priorities')
@UseGuards(JwtAuthGuard)
export class PrioritiesController {
  constructor(private readonly prioritiesService: PrioritiesService) {}

  @Get('current')
  async getCurrent(@CurrentUser() user: any) {
    return this.prioritiesService.getCurrentPriority(user.id);
  }

  @Get('all')
  async getAll(@CurrentUser() user: any) {
    return this.prioritiesService.getAllPriorities(user.id);
  }

  @Post('advance')
  @UseGuards(RoleGuard)
  @Roles('coach')
  async advance(@Body() body: any, @CurrentUser() user: any) {
    // Coach can advance a specific student's priority by providing student_id in the body.
    // Falls back to advancing the coach's own priority if no student_id is given.
    const targetId = body?.student_id || user.id;
    return this.prioritiesService.advancePriority(targetId);
  }
}
