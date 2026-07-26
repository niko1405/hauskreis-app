import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { AppConfigService } from './config/config.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  const config = app.get(AppConfigService);
  const corsOrigins = config.get('CORS_ORIGINS');

  app.use(helmet());
  app.use(compression());
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  await app.listen(config.get('PORT'));
}

void bootstrap();
