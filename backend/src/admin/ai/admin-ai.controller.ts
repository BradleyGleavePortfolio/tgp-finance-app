import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { RoleGuard } from '../../auth/guards/role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AICircuitBreakerService } from '../../ai/ai-circuit-breaker.service';
import { AI_INTENTS, type AIIntent } from '../../ai/ai-intent';

const IntentSchema = z.object({
  intent: z.enum(['chat', 'eod_insight', 'spending_dna']),
});

/**
 * AdminAIController
 *
 * OWNER-only observability + manual control surface for the AI circuit
 * breaker. Three jobs:
 *
 *   GET  /api/admin/ai/circuit-breaker        \u2014 read state for all intents
 *   POST /api/admin/ai/circuit-breaker/trip   \u2014 manually OPEN a breaker
 *                                                (drill / kill switch)
 *   POST /api/admin/ai/circuit-breaker/reset  \u2014 manually CLOSE a breaker
 *                                                (after a confirmed upstream
 *                                                recovery, skipping the
 *                                                HALF_OPEN probe)
 *
 * The trip / reset endpoints are intentionally not idempotent in the sense
 * that calling trip on an already-open breaker still rewrites `opened_at` to
 * NOW \u2014 that is by design, so an operator can extend the cooldown by re-
 * tripping during an incident.
 */
@ApiTags('admin')
@Controller('api/admin/ai')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles('owner')
export class AdminAIController {
  constructor(private readonly breaker: AICircuitBreakerService) {}

  @Get('circuit-breaker')
  @ApiOperation({
    summary: 'Read circuit breaker state for all AI intents',
    description:
      'Returns per-intent state (closed | open | half_open), failure counts in window, and next probe time.',
  })
  status() {
    return {
      intents: this.breaker.statusAll(),
      worst_state: this.breaker.worstState(),
    };
  }

  @Post('circuit-breaker/trip')
  @ApiOperation({
    summary: 'Manually trip the breaker OPEN for one intent',
    description:
      'Used as a kill switch when ops know the upstream is bad before five organic failures accumulate. Cooldown timer restarts at the moment of the call.',
  })
  trip(@Body() body: unknown) {
    const intent = this.parseIntent(body);
    return this.breaker.forceOpen(intent);
  }

  @Post('circuit-breaker/reset')
  @ApiOperation({
    summary: 'Manually force the breaker CLOSED for one intent',
    description:
      'Skips the HALF_OPEN probe. Use only after independently confirming the upstream is healthy \u2014 the probe-and-promote flow exists for a reason.',
  })
  reset(@Body() body: unknown) {
    const intent = this.parseIntent(body);
    return this.breaker.forceClose(intent);
  }

  private parseIntent(body: unknown): AIIntent {
    const parsed = IntentSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error:
          parsed.error.errors.map((e) => e.message).join(', ') ||
          `intent must be one of: ${AI_INTENTS.join(', ')}`,
        code: 'VALIDATION_ERROR',
      });
    }
    return parsed.data.intent;
  }
}
