import { Module } from '@nestjs/common';
import { AIController } from './ai.controller';
import { AIService } from './ai.service';
import { AIRateLimitService } from './ai-rate-limit.service';
import { AICircuitBreakerService } from './ai-circuit-breaker.service';
import { AIResponseCacheService } from './ai-response-cache.service';

@Module({
  controllers: [AIController],
  providers: [
    AIService,
    AIRateLimitService,
    AICircuitBreakerService,
    AIResponseCacheService,
  ],
  // Export the breaker + cache so the admin module (and /health/deep) can
  // read state without going through the AI controller.
  exports: [
    AIService,
    AIRateLimitService,
    AICircuitBreakerService,
    AIResponseCacheService,
  ],
})
export class AIModule {}
