import {
  Controller, Get, Post, Body, Param, Query, UseGuards, BadRequestException,
  DefaultValuePipe, ParseIntPipe,
} from '@nestjs/common';
import { CoachService } from './coach.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RoleGuard } from '../auth/guards/role.guard';
import { OwnsStudentGuard } from '../auth/guards/owns-student.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateCoachNoteSchema, CreateProgramTemplateSchema } from '../common/validators/schemas';

@Controller('api/coach')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles('coach')
export class CoachController {
  constructor(private readonly coachService: CoachService) {}

  @Get('students')
  async getStudents(@CurrentUser() user: CurrentUser, @Query('search') search?: string) {
    return this.coachService.getStudents(user.id, search, user.role);
  }

  /**
   * Phase 1B: messaging-friendly client summary. Returns the assigned
   * client's profile + EOD/net-worth/habit/account summaries that the coach
   * needs visible while messaging them. OWNER bypass is handled by
   * OwnsStudentGuard.
   */
  @Get('clients/:id/summary')
  @UseGuards(OwnsStudentGuard)
  async getClientSummary(@Param('id') id: string, @CurrentUser() user: CurrentUser) {
    return this.coachService.getClientSummary(user.id, id, user.role);
  }

  @Get('students/:id')
  @UseGuards(OwnsStudentGuard)
  async getStudentDetail(@Param('id') id: string, @CurrentUser() user: CurrentUser) {
    return this.coachService.getStudentDetail(user.id, id, user.role);
  }

  @Get('students/:id/detail')
  @UseGuards(OwnsStudentGuard)
  async getStudentDetailWithHistory(
    @Param('id') id: string,
    @Query('days', new DefaultValuePipe(90), ParseIntPipe) days: number,
    @CurrentUser() user: CurrentUser,
  ) {
    return this.coachService.getStudentDetailWithHistory(user.id, id, days, user.role);
  }

  @Get('alerts')
  async getAlerts(@CurrentUser() user: CurrentUser) {
    return this.coachService.getAlerts(user.id);
  }

  @Post('notes/:student_id')
  @UseGuards(OwnsStudentGuard)
  async createNote(
    @Param('student_id') studentId: string,
    @Body() body: unknown,
    @CurrentUser() user: CurrentUser,
  ) {
    const parsed = CreateCoachNoteSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.coachService.createNote(user.id, studentId, parsed.data.note, parsed.data.is_private);
  }

  @Get('digest')
  async getDigest(@CurrentUser() user: CurrentUser) {
    return this.coachService.getWeeklyDigest(user.id);
  }

  @Get('templates')
  async getTemplates(@CurrentUser() user: CurrentUser) {
    return this.coachService.getTemplates(user.id);
  }

  @Post('templates')
  async createTemplate(@Body() body: unknown, @CurrentUser() user: CurrentUser) {
    const parsed = CreateProgramTemplateSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.coachService.createTemplate(user.id, parsed.data);
  }

  @Post('templates/:id/apply/:student_id')
  @UseGuards(OwnsStudentGuard)
  async applyTemplate(
    @Param('id') templateId: string,
    @Param('student_id') studentId: string,
    @CurrentUser() user: CurrentUser,
  ) {
    return this.coachService.applyTemplate(user.id, templateId, studentId);
  }
}
