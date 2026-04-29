import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPreferences(userId: string) {
    const prefs = await this.prisma.notificationPreferences.findUnique({
      where: { user_id: userId },
    });

    if (!prefs) {
      // Create default preferences
      return this.prisma.notificationPreferences.create({
        data: { user_id: userId },
      });
    }

    return prefs;
  }

  async updatePreferences(
    userId: string,
    data: Omit<Prisma.NotificationPreferencesUncheckedUpdateInput, 'user_id'>,
  ) {
    return this.prisma.notificationPreferences.upsert({
      where: { user_id: userId },
      update: data,
      create: {
        user_id: userId,
        ...(data as Omit<Prisma.NotificationPreferencesUncheckedCreateInput, 'user_id'>),
      },
    });
  }
}
