import { Module } from '@nestjs/common';
import { PushSenderService } from './push-sender.service';
import { PushSchedulerService } from './push-scheduler.service';

// Standalone module so other features (EOD, milestones, priorities) can
// depend on PushSenderService without pulling in the scheduler directly.
// The scheduler is declared here because `@Cron()` decorators only fire on
// providers registered in a module that imports ScheduleModule (wired at
// AppModule level via `ScheduleModule.forRoot()`).
@Module({
  providers: [PushSenderService, PushSchedulerService],
  exports: [PushSenderService],
})
export class PushModule {}
