// Load .env from project root BEFORE anything else touches process.env
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

// Initialise Sentry as the very next import (after env is loaded so it can
// see SENTRY_DSN, but before any module that might throw or be instrumented).
import './instrument';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module';
import { assertRequiredEnv } from './common/env';

async function bootstrap() {
  // Fail fast at boot if a required secret is missing. Prior behavior was to
  // let the app start and throw on the first request that needed it, making
  // deploy regressions silent until a paying user hit them. The list lives in
  // src/common/env.ts so the standalone `npm run check:env` script and the
  // boot path stay in sync.
  try {
    assertRequiredEnv();
  } catch (err) {
    new Logger('Bootstrap').error((err as Error).message);
    throw err;
  }
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // SECURITY: CORS must NOT reflect arbitrary origins. Use an env-driven allow-list
  // (comma-separated in CORS_ORIGINS). Default to local Expo dev origins when unset so
  // developers can still run the app locally without extra config.
  const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:8081,http://localhost:19006')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // OpenAPI / Swagger UI. Always mounted in non-production. In production it
  // is opt-in via ENABLE_SWAGGER=true so the public-facing API surface isn't
  // documented for casual visitors by default. The JSON spec is also exposed
  // at /api/docs-json for codegen tooling.
  const swaggerEnabled =
    process.env.ENABLE_SWAGGER === 'true' || process.env.NODE_ENV !== 'production';
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('TGP Finance API')
      .setDescription(
        'The Growth Project: Finance — backend API. ' +
          'Public routes are marked; everything else requires a Supabase JWT.',
      )
      .setVersion(process.env.RELEASE_SHA || process.env.npm_package_version || '1.0.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'supabase-jwt',
      )
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      jsonDocumentUrl: 'api/docs-json',
      swaggerOptions: { persistAuthorization: true },
    });
    Logger.log('OpenAPI docs available at /api/docs (JSON: /api/docs-json)', 'Bootstrap');
  }

  // Surface unhandled rejections / uncaught exceptions to Sentry. Without
  // these, async errors that escape Nest's filter chain would be silently
  // swallowed in production.
  process.on('unhandledRejection', (reason) => {
    Sentry.captureException(reason);
    new Logger('UnhandledRejection').error(reason);
  });
  process.on('uncaughtException', (err) => {
    Sentry.captureException(err);
    new Logger('UncaughtException').error(err);
  });

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');

  Logger.log(`🚀 TGP Finance API running on port ${port}`, 'Bootstrap');
  Logger.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`, 'Bootstrap');
  Logger.log(`🔐 Multi-tenant guard: ENABLED`, 'Bootstrap');
  Logger.log(`🤖 AI Coach: FP (sonar-pro) — Rate limit: 20 req/user/hour`, 'Bootstrap');
}

bootstrap().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
