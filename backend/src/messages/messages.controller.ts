// Sprint A audit fix CR-3 — client-side messages controller.
//
// Mounts under /api/messages. Auth is the standard JwtAuthGuard +
// RoleGuard('student'). All routes scope by req.user.id; the
// service resolves the assigned coach internally so a client cannot
// address an arbitrary coach.

import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RoleGuard } from '../auth/guards/role.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MessagesService } from './messages.service';

@Controller('api/messages')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles('student')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  async getThread(
    @CurrentUser() user: { id: string },
    @Query('limit') limitRaw?: string,
    @Query('before') before?: string,
  ) {
    const limit = limitRaw ? Number(limitRaw) : undefined;
    return this.messages.getThread(user.id, {
      limit: Number.isFinite(limit) ? (limit as number) : undefined,
      before,
    });
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: { id: string }) {
    return this.messages.unreadCount(user.id);
  }

  // 60/min/IP — generous enough for normal chatter, low enough that a
  // runaway client-side bug cannot fill the thread table.
  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async send(@CurrentUser() user: { id: string }, @Body() body: { body?: unknown }) {
    return this.messages.send(user.id, body?.body);
  }

  @Post('read')
  async markRead(@CurrentUser() user: { id: string }) {
    return this.messages.markRead(user.id);
  }
}
