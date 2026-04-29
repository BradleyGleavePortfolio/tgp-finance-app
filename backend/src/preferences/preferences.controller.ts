// UX Psychology Report #4: Preference-Controlled Personalization
// GET /users/me/preferences — returns current user preferences
// PATCH /users/me/preferences — updates partial preferences
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { PreferencesService } from './preferences.service';

@Controller('users/me/preferences')
@UseGuards(JwtAuthGuard)
export class PreferencesController {
  constructor(private readonly preferencesService: PreferencesService) {}

  @Get()
  get(@CurrentUser() user: CurrentUser) {
    return this.preferencesService.get(user.id);
  }

  @Patch()
  @HttpCode(200)
  patch(@CurrentUser() user: CurrentUser, @Body() dto: UpdatePreferencesDto) {
    return this.preferencesService.patch(user.id, dto);
  }
}
