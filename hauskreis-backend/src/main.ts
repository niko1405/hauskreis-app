import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import compression from 'compression';
import { json } from 'express';
import { AppModule } from './app.module';
import { AppConfigService } from './config/config.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  const config = app.get(AppConfigService);
  const corsOrigins = config.get('CORS_ORIGINS');

  // Behind a reverse proxy every request would otherwise look like it came from
  // the proxy, and the rate limiter would count the whole group as one caller.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(compression());
  // Pinned rather than left to the Express default, so the limit is a decision
  // on the record. Nothing this API accepts comes close to it.
  app.use(json({ limit: '128kb' }));
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
    // Without this the browser hides the ETag from a cross-origin frontend —
    // only the CORS-safelisted headers are readable by default. No ETag means
    // no `If-Match`, and every PATCH from the app would come back 428.
    exposedHeaders: ['ETag'],
  });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  await app.listen(config.get('PORT'));
}

void bootstrap();
