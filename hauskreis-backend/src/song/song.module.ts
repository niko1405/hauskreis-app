import { Module } from '@nestjs/common';
import { SongController } from './song.controller';
import { SongService } from './song.service';
import { MeetingSongController } from './meeting-song.controller';
import { MeetingSongService } from './meeting-song.service';
import { SongReminderService } from './song-reminder.service';
import { SongLookupController } from './song-lookup.controller';
import { SongLookupService } from './song-lookup.service';
import { GeminiClient } from './gemini.client';
import { PersonModule } from '../person/person.module';
import { RoleSuggestionModule } from '../role-suggestion/role-suggestion.module';
import { NotificationModule } from '../notification/notification.module';
import { EditRightsModule } from '../meeting/edit-rights.module';
import { AttendanceModule } from '../attendance/attendance.module';

/**
 * The song database and everything songs-related on a meeting.
 *
 * `PersonModule` resolves the logged-in person for "wer hat das vorgeschlagen",
 * `RoleSuggestionModule` ranks who could lead the music — the same engine as
 * for hosts and topics, only with `playsInstrument` as the filter.
 * `EditRightsModule` beantwortet, wer vor dem Abend abhaken darf; es importiert
 * selbst nichts, damit daraus keine Kante zu MeetingModule wird.
 *
 * `SongLookupService` ist die einzige Stelle im Backend, die mit einem
 * KI-Anbieter spricht. Sie liegt hier und nicht in einem eigenen Modul, weil
 * sie nichts kann, was über Lieder hinausgeht.
 */
@Module({
  imports: [
    PersonModule,
    RoleSuggestionModule,
    NotificationModule,
    EditRightsModule,
    AttendanceModule,
  ],
  controllers: [SongController, MeetingSongController, SongLookupController],
  providers: [
    SongService,
    MeetingSongService,
    SongReminderService,
    SongLookupService,
    GeminiClient,
  ],
  exports: [SongService, SongReminderService],
})
export class SongModule {}
