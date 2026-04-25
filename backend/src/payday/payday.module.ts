import { Module } from '@nestjs/common';
import { PaydayController } from './payday.controller';
import { PaydayService } from './payday.service';

@Module({
  controllers: [PaydayController],
  providers: [PaydayService],
})
export class PaydayModule {}
