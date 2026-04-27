import { Module } from '@nestjs/common';
import { AIController } from './ai.controller';
import { AIService } from './ai.service';
import { AIRateLimitService } from './ai-rate-limit.service';

@Module({
  controllers: [AIController],
  providers: [AIService, AIRateLimitService],
  exports: [AIService, AIRateLimitService],
})
export class AIModule {}
