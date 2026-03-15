import { Module } from '@nestjs/common';
import { NetWorthController } from './networth.controller';
import { NetWorthService } from './networth.service';

@Module({
  controllers: [NetWorthController],
  providers: [NetWorthService],
  exports: [NetWorthService],
})
export class NetWorthModule {}
