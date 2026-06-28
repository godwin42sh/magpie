import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';

/**
 * Bootstraps the NestJS application.
 *
 * - Global route prefix `/api` (every controller route lives under /api).
 * - CORS enabled (the Vite frontend runs on a different origin in dev).
 * - Listens on port 3000 (overridable via PORT).
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.setGlobalPrefix('api');

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
