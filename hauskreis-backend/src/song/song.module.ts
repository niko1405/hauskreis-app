import { Module } from '@nestjs/common';
import { SongController } from './song.controller';
import { SongService } from './song.service';
import { MeetingSongController } from './meeting-song.controller';
import { MeetingSongService } from './meeting-song.service';
import { SongReminderService } from './song-reminder.service';
import { PersonModule } from '../person/person.module';
import { RoleSuggestionModule } from '../role-suggestion/role-suggestion.module';
import { NotificationModule } from '../notification/notification.module';
import { EditRightsModule } from '../meeting/edit-rights.module';

/**
 * The song database and everything songs-related on a meeting.
 *
 * `PersonModule` resolves the logged-in person for "wer hat das vorgeschlagen",
 * `RoleSuggestionModule` ranks who could lead the music — the same engine as
 * for hosts and topics, only with `playsInstrument` as the filter.
 * `EditRightsModule` beantwortet, wer vor dem Abend abhaken darf; es importiert
 * selbst nichts, damit daraus keine Kante zu MeetingModule wird.
 */
@Module({
  imports: [
    PersonModule,
    RoleSuggestionModule,
    NotificationModule,
    EditRightsModule,
  ],
  controllers: [SongController, MeetingSongController],
  providers: [SongService, MeetingSongService, SongReminderService],
  exports: [SongService, SongReminderService],
})
export class SongModule {}
