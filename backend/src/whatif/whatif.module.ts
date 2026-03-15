import { Module } from '@nestjs/common';
import { WhatIfController } from './whatif.controller';
import { WhatIfService } from './whatif.service';

@Module({
  controllers: [WhatIfController],
  providers: [WhatIfService],
  exports: [WhatIfService],
})
export class WhatIfModule {}
