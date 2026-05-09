import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, BadRequestException,
  DefaultValuePipe, ParseIntPipe,
} from '@nestjs/common';
import { CoachService } from './coach.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RoleGuard } from '../auth/guards/role.guard';
import { OwnsStudentGuard } from '../auth/guards/owns-student.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  CreateCoachNoteSchema,
  CreateProgramTemplateSchema,
  CreateAssignmentSchema,
  UpdateAssignmentSchema,
  SendCoachMessageSchema,
  CreateCommunityPostSchema,
  UpdateCommunityPostSchema,
} from '../common/validators/schemas';

@Controller('api/coach')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles('coach')
export class CoachController {
  constructor(private readonly coachService: CoachService) {}

  // ── Roster ─────────────────────────────────────────────────────────────

  @Get('students')
  async getStudents(@CurrentUser() user: CurrentUser, @Query('search') search?: string) {
    return this.coachService.getStudents(user.id, search, user.role);
  }

  /**
   * Stage 2 — searchable, sortable, status-filtered client list for the
   * EHR-style ClientsList screen. `search` is matched against name + email;
   * `status` filters to the derived bucket; `sort` accepts
   * 'name' | 'last_activity' | 'net_worth' | 'savings_rate'.
   */
  @Get('clients')
  async getCoachClients(
    @CurrentUser() user: CurrentUser,
    @Query('search') search?: string,
    @Query('status') status?: 'all' | 'active' | 'at_risk' | 'onboarding' | 'inactive',
    @Query('sort') sort?: 'name' | 'last_activity' | 'net_worth' | 'savings_rate',
  ) {
    return this.coachService.getCoachClients(user.id, {
      search,
      status,
      sort,
      role: user.role,
    });
  }

  /**
   * Stage 2 — single round-trip CoachHome dashboard payload. Returns
   * roster-level stats, a compact "needs attention" list, and a recent
   * activity feed (EOD submissions + milestone unlocks).
   */
  @Get('dashboard')
  async getCoachDashboard(@CurrentUser() user: CurrentUser) {
    return this.coachService.getCoachDashboard(user.id, user.role);
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

  @Get('clients/:id/accounts')
  @UseGuards(OwnsStudentGuard)
  async getClientAccounts(@Param('id') id: string, @CurrentUser() user: CurrentUser) {
    return this.coachService.getClientAccounts(user.id, id, user.role);
  }

  @Get('clients/:id/cashflow')
  @UseGuards(OwnsStudentGuard)
  async getClientCashflow(@Param('id') id: string, @CurrentUser() user: CurrentUser) {
    return this.coachService.getClientCashflow(user.id, id, user.role);
  }

  @Get('clients/:id/goals')
  @UseGuards(OwnsStudentGuard)
  async getClientGoals(@Param('id') id: string, @CurrentUser() user: CurrentUser) {
    return this.coachService.getClientGoals(user.id, id, user.role);
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

  // ── Notes ──────────────────────────────────────────────────────────────

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

  @Get('clients/:id/notes')
  @UseGuards(OwnsStudentGuard)
  async listClientNotes(@Param('id') id: string, @CurrentUser() user: CurrentUser) {
    return this.coachService.listClientNotes(user.id, id, user.role);
  }

  @Patch('notes/:note_id')
  async patchNote(
    @Param('note_id') noteId: string,
    @Body() body: { note?: string; is_private?: boolean },
    @CurrentUser() user: CurrentUser,
  ) {
    return this.coachService.updateNote(user.id, noteId, body, user.role);
  }

  @Delete('notes/:note_id')
  async deleteNote(@Param('note_id') noteId: string, @CurrentUser() user: CurrentUser) {
    return this.coachService.deleteNote(user.id, noteId, user.role);
  }

  // ── Assignments ────────────────────────────────────────────────────────

  @Get('clients/:id/assignments')
  @UseGuards(OwnsStudentGuard)
  async listClientAssignments(@Param('id') id: string, @CurrentUser() user: CurrentUser) {
    return this.coachService.listClientAssignments(user.id, id, user.role);
  }

  @Post('clients/:id/assignments')
  @UseGuards(OwnsStudentGuard)
  async createAssignment(
    @Param('id') clientId: string,
    @Body() body: unknown,
    @CurrentUser() user: CurrentUser,
  ) {
    const parsed = CreateAssignmentSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.coachService.createAssignment(user.id, clientId, parsed.data, user.role);
  }

  @Patch('assignments/:assignment_id')
  async updateAssignment(
    @Param('assignment_id') assignmentId: string,
    @Body() body: unknown,
    @CurrentUser() user: CurrentUser,
  ) {
    const parsed = UpdateAssignmentSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.coachService.updateAssignment(user.id, assignmentId, parsed.data, user.role);
  }

  @Delete('assignments/:assignment_id')
  async deleteAssignment(
    @Param('assignment_id') assignmentId: string,
    @CurrentUser() user: CurrentUser,
  ) {
    return this.coachService.deleteAssignment(user.id, assignmentId, user.role);
  }

  // ── Messages ───────────────────────────────────────────────────────────

  @Get('messages')
  async getCoachMessageInbox(@CurrentUser() user: CurrentUser) {
    return this.coachService.getCoachMessageInbox(user.id, user.role);
  }

  @Get('clients/:id/messages')
  @UseGuards(OwnsStudentGuard)
  async getCoachMessageThread(
    @Param('id') clientId: string,
    @CurrentUser() user: CurrentUser,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    return this.coachService.getCoachMessageThread(user.id, clientId, user.role, limit);
  }

  @Post('clients/:id/messages')
  @UseGuards(OwnsStudentGuard)
  async sendCoachMessage(
    @Param('id') clientId: string,
    @Body() body: unknown,
    @CurrentUser() user: CurrentUser,
  ) {
    const parsed = SendCoachMessageSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.coachService.sendCoachMessage(user.id, clientId, parsed.data.body, user.role);
  }

  // ── Community posts ────────────────────────────────────────────────────

  @Get('community/posts')
  async listCommunityPosts(@CurrentUser() user: CurrentUser) {
    return this.coachService.listCommunityPosts(user.id, user.role);
  }

  @Post('community/posts')
  async createCommunityPost(@Body() body: unknown, @CurrentUser() user: CurrentUser) {
    const parsed = CreateCommunityPostSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.coachService.createCommunityPost(user.id, parsed.data);
  }

  @Patch('community/posts/:post_id')
  async updateCommunityPost(
    @Param('post_id') postId: string,
    @Body() body: unknown,
    @CurrentUser() user: CurrentUser,
  ) {
    const parsed = UpdateCommunityPostSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.coachService.updateCommunityPost(user.id, postId, parsed.data, user.role);
  }

  @Delete('community/posts/:post_id')
  async deleteCommunityPost(
    @Param('post_id') postId: string,
    @CurrentUser() user: CurrentUser,
  ) {
    return this.coachService.deleteCommunityPost(user.id, postId, user.role);
  }

  // ── Practice analytics ─────────────────────────────────────────────────

  @Get('analytics')
  async getPracticeAnalytics(@CurrentUser() user: CurrentUser) {
    return this.coachService.getPracticeAnalytics(user.id, user.role);
  }

  // ── Existing program-templates + digest endpoints (unchanged) ──────────

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
