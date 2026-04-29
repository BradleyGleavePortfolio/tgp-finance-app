import { Controller, Get, Put, Post, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateNotificationPrefsSchema } from '../common/validators/schemas';
import { PushSenderService } from '../push/push-sender.service';
import { PushType } from '../push/push.types';

const RegisterTokenSchema = z.object({
  expo_push_token: z.string().min(1),
});

const TestPushSchema = z.object({
  type: z.enum([
    'eod_reminder',
    'net_worth_milestone',
    'priority_levelup',
    'future_self_letter',
    'spending_dna',
  ]),
});

@Controller('api/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly pushSender: PushSenderService,
  ) {}

  @Get('preferences')
  async getPreferences(@CurrentUser() user: CurrentUser) {
    return this.notificationsService.getPreferences(user.id);
  }

  @Put('preferences')
  async updatePreferences(@Body() body: unknown, @CurrentUser() user: CurrentUser) {
    const parsed = UpdateNotificationPrefsSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.notificationsService.updatePreferences(user.id, parsed.data);
  }

  // Save the Expo push token for the authed user. Idempotent — single token
  // per user. Clients should call this on app start and any time the token
  // rotates.
  @Post('register-token')
  async registerToken(@Body() body: unknown, @CurrentUser() user: CurrentUser) {
    const parsed = RegisterTokenSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    await this.notificationsService.updatePreferences(user.id, {
      expo_push_token: parsed.data.expo_push_token,
    });
    return { registered: true };
  }

  // Admin/QA helper — send a test push of any type to the current user.
  // Respects the type's preference toggle but skips dedupe so it always
  // attempts delivery. Useful for Fly.io smoke tests post-deploy.
  @Post('test')
  async testPush(@Body() body: unknown, @CurrentUser() user: CurrentUser) {
    const parsed = TestPushSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    const type = parsed.data.type as PushType;
    const result = await this.pushSender.send(
      user.id,
      type,
      {
        title: `Test push: ${type}`,
        body: 'If you can see this, push delivery works end-to-end.',
        data: { test: true, type },
      },
      { bypassDedupe: true },
    );
    return result;
  }
}
