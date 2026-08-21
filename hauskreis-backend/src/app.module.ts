import { Module, RequestMethod } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './config/config.module';
import { AppConfigService } from './config/config.service';
import { PrismaModule } from './prisma/prisma.module';
import { ClockModule } from './meeting/group-clock.service';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { ZodValidationPipe } from './common/pipes/zod-validation.pipe';
import { EtagInterceptor } from './common/http/etag.interceptor';
import { NoStoreInterceptor } from './common/http/no-store.interceptor';
import { ResponseSerializerInterceptor } from './common/http/response-serializer.interceptor';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { HauskreisModule } from './hauskreis/hauskreis.module';
import { PersonModule } from './person/person.module';
import { LocationModule } from './location/location.module';
import { MeetingModule } from './meeting/meeting.module';
import { TopicModule } from './topic/topic.module';
import { SongModule } from './song/song.module';
import { PrayerBuddyModule } from './prayer-buddy/prayer-buddy.module';
import { BirthdayModule } from './birthday/birthday.module';
import { PrayerRequestModule } from './prayer-request/prayer-request.module';
import { NotificationModule } from './notification/notification.module';
import { AbsenceModule } from './absence/absence.module';
import { ArchiveModule } from './archive/archive.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HeaderImageModule } from './header-image/header-image.module';
import { ReleaseModule } from './release/release.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        // nestjs-pino hängt seine Middleware standardmäßig an `path: '*'` —
        // die Express-4-Schreibweise, die es aus Rückwärtskompatibilität
        // beibehält. Unter Express 5 warnt path-to-regexp darüber bei jedem
        // Start, zweimal, weil zwei Middlewares registriert werden. Die
        // benannte Form sagt dasselbe und schweigt.
        forRoutes: [{ path: '{*splat}', method: RequestMethod.ALL }],
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
    // Deliberately generous: a member opening the app fires a handful of
    // requests at once, and the home screen alone is several. This is a stop
    // for runaway loops and for unauthenticated traffic on /api/health, not a
    // quota anybody should ever notice.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    PrismaModule,
    // Global wie Prisma: „welchen Tag hat diese Gruppe gerade" fragt fast jedes
    // Modul, und keines soll dafür den Terminplan importieren müssen.
    ClockModule,
    AuthModule,
    HauskreisModule,
    PersonModule,
    LocationModule,
    MeetingModule,
    TopicModule,
    SongModule,
    PrayerBuddyModule,
    BirthdayModule,
    PrayerRequestModule,
    NotificationModule,
    AbsenceModule,
    ArchiveModule,
    DashboardModule,
    HeaderImageModule,
    ReleaseModule,
  ],
  controllers: [HealthController],
  providers: [
    // Nine people cannot generate load, so this is not about capacity. It is
    // about the endpoints anyone can reach without a token — /api/health does a
    // database round trip per call — and about a stuck client hammering the API
    // in a loop.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: NoStoreInterceptor },
    { provide: APP_INTERCEPTOR, useClass: EtagInterceptor },
    // Nach dem ETag-Interceptor eingetragen und damit weiter innen: auf dem
    // Rückweg läuft dieser hier zuerst, der ETag wird also aus der bereits
    // beschnittenen Antwort gebildet und nicht aus der rohen.
    { provide: APP_INTERCEPTOR, useClass: ResponseSerializerInterceptor },
  ],
})
export class AppModule {}
