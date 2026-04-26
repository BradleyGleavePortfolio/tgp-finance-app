import { Module, Global } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

/**
 * AnalyticsModule — globally registered so AnalyticsService can be injected
 * anywhere without per-module imports.
 */
@Global()
@Module({
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
