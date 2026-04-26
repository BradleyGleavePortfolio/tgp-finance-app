// UX Psychology Report #4: Preference-Controlled Personalization
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

const DEFAULT_PREFS = {
  homeModules: ['hero', 'milestone', 'trustcues', 'secondary'],
  notificationCadence: 'weekly' as const,
  motivationalTone: 'direct' as const,
  currency: 'USD' as const,
  firstDayOfWeek: 1,
};

function mapRow(row: {
  home_modules: string[];
  notification_cadence: string;
  motivational_tone: string;
  currency: string;
  first_day_of_week: number;
}) {
  return {
    homeModules: row.home_modules,
    notificationCadence: row.notification_cadence as 'daily' | 'weekly' | 'off',
    motivationalTone: row.motivational_tone as 'gentle' | 'direct' | 'drill',
    currency: row.currency as 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD',
    firstDayOfWeek: row.first_day_of_week as 0 | 1 | 6,
  };
}

@Injectable()
export class PreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string) {
    const row = await this.prisma.userPreferences.findUnique({
      where: { user_id: userId },
    });
    if (!row) return DEFAULT_PREFS;
    return mapRow(row);
  }

  async patch(userId: string, dto: UpdatePreferencesDto) {
    const data: Record<string, unknown> = {};
    if (dto.homeModules !== undefined) data.home_modules = dto.homeModules;
    if (dto.notificationCadence !== undefined) data.notification_cadence = dto.notificationCadence;
    if (dto.motivationalTone !== undefined) data.motivational_tone = dto.motivationalTone;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.firstDayOfWeek !== undefined) data.first_day_of_week = dto.firstDayOfWeek;

    const row = await this.prisma.userPreferences.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        home_modules: (dto.homeModules ?? DEFAULT_PREFS.homeModules),
        notification_cadence: (dto.notificationCadence ?? DEFAULT_PREFS.notificationCadence),
        motivational_tone: (dto.motivationalTone ?? DEFAULT_PREFS.motivationalTone),
        currency: (dto.currency ?? DEFAULT_PREFS.currency),
        first_day_of_week: (dto.firstDayOfWeek ?? DEFAULT_PREFS.firstDayOfWeek),
      },
      update: data,
    });
    return mapRow(row);
  }
}
