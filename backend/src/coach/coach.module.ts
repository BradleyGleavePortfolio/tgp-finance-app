import { Module } from '@nestjs/common';
import { CoachController } from './coach.controller';
import { CoachService } from './coach.service';
import { OwnsStudentGuard } from '../auth/guards/owns-student.guard';

@Module({
  controllers: [CoachController],
  // OwnsStudentGuard is route-scoped (applied via @UseGuards on coach
  // student-scoped routes). Provided here so NestJS DI can resolve it.
  providers: [CoachService, OwnsStudentGuard],
  exports: [CoachService],
})
export class CoachModule {}
