import { Module } from '@nestjs/common';
import { ProjectionsController } from './projections.controller';
import { ProjectionsService } from './projections.service';

@Module({
  controllers: [ProjectionsController],
  providers: [ProjectionsService],
  exports: [ProjectionsService],
})
export class ProjectionsModule {}
