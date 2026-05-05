import {
  Controller, Post, Get, Body, UseGuards, BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AIService } from './ai.service';
import { AIRateLimitService } from './ai-rate-limit.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AIChatSchema, EODInsightSchema, SpendingDnaSchema } from '../common/validators/schemas';

@ApiTags('ai')
@ApiBearerAuth('supabase-jwt')
@Controller('api/ai')
@UseGuards(JwtAuthGuard)
export class AIController {
  constructor(
    private readonly aiService: AIService,
    private readonly rateLimit: AIRateLimitService,
  ) {}

  @Post('chat')
  @ApiOperation({
    summary: 'Send a coach chat message.',
    description: 'Counts against the per-user 20/hr AI budget tracked in ai_request_logs.',
  })
  async chat(@Body() body: unknown, @CurrentUser() user: CurrentUser) {
    const parsed = AIChatSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.aiService.chat(user.id, parsed.data.message, parsed.data.conversation_history);
  }

  @Get('context')
  async getContext(@CurrentUser() user: CurrentUser) {
    return this.aiService.buildUserContext(user.id);
  }

  @Post('eod-insight')
  async eodInsight(@Body() body: unknown, @CurrentUser() user: CurrentUser) {
    const parsed = EODInsightSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ error: 'eod_submission_id required', code: 'VALIDATION_ERROR' });
    }
    return this.aiService.generateEODInsight(user.id, parsed.data.eod_submission_id);
  }

  @Post('spending-dna')
  async spendingDna(@Body() body: unknown, @CurrentUser() user: CurrentUser) {
    const parsed = SpendingDnaSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ error: 'month required (YYYY-MM format)', code: 'VALIDATION_ERROR' });
    }
    return this.aiService.generateSpendingDNA(user.id, parsed.data.month);
  }

  // Read-only quota lookup. Lets the mobile client surface "you've used 12 of
  // 20 AI requests this hour" without consuming a request itself. Returns
  // { limit, used, remaining, window_seconds } scoped to the calling user.
  @Get('rate-limit')
  @ApiOperation({ summary: 'Read-only AI quota snapshot for the calling user.' })
  async rateLimitStatus(@CurrentUser() user: CurrentUser) {
    return this.rateLimit.snapshot(user.id);
  }

  // Lightweight metadata endpoint for the mobile client's "Spending DNA ready"
  // notification guard. Returns { month, generated_at } for the most recent
  // report, or { month: null } if none exist. Purposefully excludes the
  // report_text payload — callers that need the body already hit POST
  // /api/ai/spending-dna to (re)generate and read it.
  @Get('spending-dna/latest')
  async spendingDnaLatest(@CurrentUser() user: CurrentUser) {
    return this.aiService.getLatestSpendingDNA(user.id);
  }
}
