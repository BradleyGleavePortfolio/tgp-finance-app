import { Controller, Get, Put, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateNotificationPrefsSchema } from '../common/validators/schemas';

@Controller('api/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('preferences')
  async getPreferences(@CurrentUser() user: any) {
    return this.notificationsService.getPreferences(user.id);
  }

  @Put('preferences')
  async updatePreferences(@Body() body: any, @CurrentUser() user: any) {
    const parsed = UpdateNotificationPrefsSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: parsed.error.errors.map((e) => e.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }
    return this.notificationsService.updatePreferences(user.id, parsed.data);
  }
}
