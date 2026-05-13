import { Module } from '@nestjs/common';
import { CoachController } from './coach.controller';
import { CoachService } from './coach.service';
import { OwnsStudentGuard } from '../auth/guards/owns-student.guard';
// Stage 3 — coach practice-type storage. The cross-pillar UI lives in
// the fitness app; the finance side just persists each coach's
// declared practice type so federated search can surface it.
import { PracticeTypeController } from './practice-type/practice-type.controller';
import { PracticeTypeService } from './practice-type/practice-type.service';
// Sprint A — multi-code invite flow (parity with fitness backend).
import { InviteCodesController } from './invite-codes/invite-codes.controller';
import { InviteCodesService } from './invite-codes/invite-codes.service';
// Coach -> client message push hook (pre-TestFlight P0).
import { PushModule } from '../push/push.module';

@Module({
  imports: [PushModule],
  controllers: [CoachController, PracticeTypeController, InviteCodesController],
  // OwnsStudentGuard is route-scoped (applied via @UseGuards on coach
  // student-scoped routes). Provided here so NestJS DI can resolve it.
  providers: [CoachService, OwnsStudentGuard, PracticeTypeService, InviteCodesService],
  exports: [CoachService, InviteCodesService],
})
export class CoachModule {}
