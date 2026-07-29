import { Module } from '@nestjs/common';
import { SongController } from './song.controller';
import { SongService } from './song.service';
import { MeetingSongController } from './meeting-song.controller';
import { MeetingSongService } from './meeting-song.service';
import { SongReminderService } from './song-reminder.service';
import { PersonModule } from '../person/person.module';
import { RoleSuggestionModule } from '../role-suggestion/role-suggestion.module';
import { NotificationModule } from '../notification/notification.module';

/**
 * The song database and everything songs-related on a meeting.
 *
 * `PersonModule` resolves the logged-in person for "wer hat das vorgeschlagen",
 * `RoleSuggestionModule` ranks who could lead the music — the same engine as
 * for hosts and topics, only with `playsInstrument` as the filter.
 */
@Module({
  imports: [PersonModule, RoleSuggestionModule, NotificationModule],
  controllers: [SongController, MeetingSongController],
  providers: [SongService, MeetingSongService, SongReminderService],
  exports: [SongService, SongReminderService],
})
export class SongModule {}
