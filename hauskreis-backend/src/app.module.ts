import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './config/config.module';
import { AppConfigService } from './config/config.service';
import { PrismaModule } from './prisma/prisma.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { ZodValidationPipe } from './common/pipes/zod-validation.pipe';
import { EtagInterceptor } from './common/http/etag.interceptor';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { HauskreisModule } from './hauskreis/hauskreis.module';
import { PersonModule } from './person/person.module';
import { LocationModule } from './location/location.module';
import { MeetingModule } from './meeting/meeting.module';
import { TopicModule } from './topic/topic.module';
import { SongModule } from './song/song.module';
import { NotificationModule } from './notification/notification.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.isProduction ? 'info' : 'debug',
          transport: config.isProduction
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true } },
          redact: ['req.headers.authorization', 'req.headers.cookie'],
        },
      }),
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    HauskreisModule,
    PersonModule,
    LocationModule,
    MeetingModule,
    TopicModule,
    SongModule,
    NotificationModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: EtagInterceptor },
  ],
})
export class AppModule {}
