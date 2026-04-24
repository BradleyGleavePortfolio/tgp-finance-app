import {
  Controller, Post, Get, Body, UseGuards, BadRequestException,
} from '@nestjs/common';
import { AIService } from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AIChatSchema, EODInsightSchema, SpendingDnaSchema } from '../common/validators/schemas';

@Controller('api/ai')
@UseGuards(JwtAuthGuard)
export class AIController {
  constructor(private readonly aiService: AIService) {}

  @Post('chat')
  async chat(@Body() body: any, @CurrentUser() user: any) {
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
  async getContext(@CurrentUser() user: any) {
    return this.aiService.buildUserContext(user.id);
  }

  @Post('eod-insight')
  async eodInsight(@Body() body: any, @CurrentUser() user: any) {
    const parsed = EODInsightSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ error: 'eod_submission_id required', code: 'VALIDATION_ERROR' });
    }
    return this.aiService.generateEODInsight(user.id, parsed.data.eod_submission_id);
  }

  @Post('spending-dna')
  async spendingDna(@Body() body: any, @CurrentUser() user: any) {
    const parsed = SpendingDnaSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ error: 'month required (YYYY-MM format)', code: 'VALIDATION_ERROR' });
    }
    return this.aiService.generateSpendingDNA(user.id, parsed.data.month);
  }

  // Lightweight metadata endpoint for the mobile client's "Spending DNA ready"
  // notification guard. Returns { month, generated_at } for the most recent
  // report, or { month: null } if none exist. Purposefully excludes the
  // report_text payload — callers that need the body already hit POST
  // /api/ai/spending-dna to (re)generate and read it.
  @Get('spending-dna/latest')
  async spendingDnaLatest(@CurrentUser() user: any) {
    return this.aiService.getLatestSpendingDNA(user.id);
  }
}
