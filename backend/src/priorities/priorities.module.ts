import { Module } from '@nestjs/common';
import { PrioritiesController } from './priorities.controller';
import { PrioritiesService } from './priorities.service';
import { PushModule } from '../push/push.module';

@Module({
  imports: [PushModule],
  controllers: [PrioritiesController],
  providers: [PrioritiesService],
  exports: [PrioritiesService],
})
export class PrioritiesModule {}
