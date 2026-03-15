// Load .env from project root BEFORE anything else touches process.env
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // CORS — allow mobile app and web
  app.enableCors({
    origin: true, // Allow all origins in dev; restrict to specific domains in production
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  Logger.log(`🚀 TGP Finance API running on port ${port}`, 'Bootstrap');
  Logger.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`, 'Bootstrap');
  Logger.log(`🔐 Multi-tenant guard: ENABLED`, 'Bootstrap');
  Logger.log(`🤖 AI Coach: FP (sonar-pro) — Rate limit: 20 req/user/hour`, 'Bootstrap');
}

bootstrap().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
