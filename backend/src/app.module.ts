import * as path from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
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
import { PaydayModule } from './payday/payday.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { PushModule } from './push/push.module';
import { UsersModule } from './users/users.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { SystemModule } from './system/system.module';

import { HealthController } from './health/health.controller';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { DecimalToNumberInterceptor } from './common/interceptors/decimal-to-number.interceptor';
import { JwtAuthGuard } from './auth/guards/jwt.guard';
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

    // Scheduled jobs (server-side push notifications). Runs in-process on the
    // same Fly.io web VM — see PushSchedulerService for scaling notes.
    ScheduleModule.forRoot(),

    // Core
    PrismaModule,
    AnalyticsModule,
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
    PaydayModule,
    OnboardingModule,
    PushModule,
    UsersModule,
    SystemModule,
  ],
  controllers: [HealthController],
  providers: [
    // Global exception filter — structured errors, no stack traces
    { provide: APP_FILTER, useClass: HttpExceptionFilter },

    // Decimal → Number conversion runs BEFORE the envelope wrap so the mobile
    // client continues to receive numeric JSON for money fields after the
    // Float→Decimal schema migration. Safe because money columns are capped at
    // DECIMAL(14, 2) which fits inside JS Number precision.
    { provide: APP_INTERCEPTOR, useClass: DecimalToNumberInterceptor },

    // Global response transform — wraps all responses in { data, success, timestamp }
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },

    // Global guard chain. Order is significant — NestJS evaluates APP_GUARD
    // providers in the order they appear here.
    //
    // 1) ThrottlerGuard — cheap-fail abusive traffic before any auth work.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    //
    // 2) JwtAuthGuard — verifies the bearer token and populates request.user.
    //    Routes opt out via @Public(). Registering this globally turns the
    //    auth model from "opt-in via @UseGuards on every controller" (which
    //    risked one missed decorator = public endpoint) to "private by
    //    default, public on explicit opt-in".
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    //
    // 3) TenantGuard — ensures multi-tenant data isolation. Reads
    //    request.user populated by step 2, so JwtAuthGuard MUST run first.
    { provide: APP_GUARD, useClass: TenantGuard },
  ],
})
export class AppModule {}
