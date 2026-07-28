import { Module } from '@nestjs/common';
import { SongController } from './song.controller';
import { SongService } from './song.service';
import { MeetingSongController } from './meeting-song.controller';
import { MeetingSongService } from './meeting-song.service';
import { PersonModule } from '../person/person.module';
import { RoleSuggestionModule } from '../role-suggestion/role-suggestion.module';

/**
 * The song database and everything songs-related on a meeting.
 *
 * `PersonModule` resolves the logged-in person for "wer hat das vorgeschlagen",
 * `RoleSuggestionModule` ranks who could lead the music — the same engine as
 * for hosts and topics, only with `playsInstrument` as the filter.
 */
@Module({
  imports: [PersonModule, RoleSuggestionModule],
  controllers: [SongController, MeetingSongController],
  providers: [SongService, MeetingSongService],
  exports: [SongService],
})
export class SongModule {}
