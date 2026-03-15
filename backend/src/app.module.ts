import * as path from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ProfileModule } from './profile/profile.module';
import { AccountsModule } from './accounts/accounts.module';
import { EODModule } from './eod/eod.module';
import { NetWorthModule } from './networth/networth.module';
import { PrioritiesModule } from './priorities/priorities.module';
import { WhatIfModule } from './whatif/whatif.module';
import { ProjectionsModule } from './projections/projections.module';
import { MilestonesModule } from './milestones/milestones.module';
import { CostLivingModule } from './costliving/costliving.module';
import { AIModule } from './ai/ai.module';
import { NotificationsModule } from './notifications/notifications.module';
import { CoachModule } from './coach/coach.module';
import { AccountabilityModule } from './accountability/accountability.module';

import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { TenantGuard } from './auth/guards/tenant.guard';

@Module({
  imports: [
    // Load .env from project root (one level above /backend)
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: path.resolve(__dirname, '..', '..', '.env'),
    }),

    // Global rate limiting (fallback for non-AI routes)
    ThrottlerModule.forRoot([
      {
        ttl: 60000,  // 1 minute window
        limit: 100,  // 100 requests per minute per IP
      },
    ]),

    // Core
    PrismaModule,
    AuthModule,

    // Feature modules
    ProfileModule,
    AccountsModule,
    EODModule,
    NetWorthModule,
    PrioritiesModule,
    WhatIfModule,
    ProjectionsModule,
    MilestonesModule,
    CostLivingModule,
    AIModule,
    NotificationsModule,
    CoachModule,
    AccountabilityModule,
  ],
  providers: [
    // Global exception filter — structured errors, no stack traces
    { provide: APP_FILTER, useClass: HttpExceptionFilter },

    // Global response transform — wraps all responses in { data, success, timestamp }
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },

    // Global tenant guard — ensures multi-tenant data isolation
    { provide: APP_GUARD, useClass: TenantGuard },
  ],
})
export class AppModule {}
