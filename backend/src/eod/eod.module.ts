import { Module } from '@nestjs/common';
import { EODController } from './eod.controller';
import { EODService } from './eod.service';
import { MilestonesModule } from '../milestones/milestones.module';
import { PrioritiesModule } from '../priorities/priorities.module';

@Module({
  imports: [MilestonesModule, PrioritiesModule],
  controllers: [EODController],
  providers: [EODService],
  exports: [EODService],
})
export class EODModule {}
