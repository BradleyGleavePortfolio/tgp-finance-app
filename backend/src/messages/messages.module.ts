// Sprint A audit fix CR-3 — client-side messages module.
// Pre-TestFlight P0: PushModule imported so the service can fire a coach
// push when a client sends a message (and vice versa from the coach side).

import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { PushModule } from '../push/push.module';

@Module({
  imports: [PushModule],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
