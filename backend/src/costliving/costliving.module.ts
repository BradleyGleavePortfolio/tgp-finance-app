import { Module } from '@nestjs/common';
import { CostLivingController } from './costliving.controller';
import { CostLivingService } from './costliving.service';

@Module({
  controllers: [CostLivingController],
  providers: [CostLivingService],
  exports: [CostLivingService],
})
export class CostLivingModule {}
