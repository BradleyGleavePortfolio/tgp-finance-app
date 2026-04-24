import { Module } from '@nestjs/common';
import { EODController } from './eod.controller';
import { EODService } from './eod.service';
import { MilestonesModule } from '../milestones/milestones.module';
import { PrioritiesModule } from '../priorities/priorities.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [MilestonesModule, PrioritiesModule, PushModule],
  controllers: [EODController],
  providers: [EODService],
  exports: [EODService],
})
export class EODModule {}
