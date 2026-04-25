// Load .env from project root BEFORE anything else touches process.env
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

// Fail fast at boot if a required secret is missing. Prior behavior was to let
// the app start and throw on the first request that needed it — making deploy
// regressions silent until a paying user hit them. Mirrors the pattern used in
// growth-project-backend (fitness).
function assertRequiredEnv() {
  const required = [
    'DATABASE_URL',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'JWT_SECRET',
    'PERPLEXITY_API_KEY',
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    const msg = `Missing required env vars: ${missing.join(', ')}`;
    new Logger('Bootstrap').error(msg);
    throw new Error(msg);
  }

  // SECURITY: refuse to boot in production with the dev backdoor enabled.
  // Belt-and-suspenders against an accidental Fly secret leak.
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ENABLE_DEV_BACKDOOR === 'true'
  ) {
    const msg =
      'ENABLE_DEV_BACKDOOR=true is not permitted when NODE_ENV=production';
    new Logger('Bootstrap').error(msg);
    throw new Error(msg);
  }
}

async function bootstrap() {
  assertRequiredEnv();
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
