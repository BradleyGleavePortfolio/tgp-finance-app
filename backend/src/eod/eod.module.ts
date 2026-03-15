import { Module } from '@nestjs/common';
import { EODController } from './eod.controller';
import { EODService } from './eod.service';

@Module({
  controllers: [EODController],
  providers: [EODService],
  exports: [EODService],
})
export class EODModule {}
