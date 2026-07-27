import { Module } from '@nestjs/common';
import { RoleSuggestionService } from './role-suggestion.service';
import { LocationSuggestionService } from './location-suggestion.service';

/**
 * The shared suggestion engine. Imported by `MeetingModule` today and by
 * `TopicModule`/`SongModule` from Phase 5 on — each of those adds an event
 * adapter here instead of writing its own ranking.
 */
@Module({
  providers: [RoleSuggestionService, LocationSuggestionService],
  exports: [RoleSuggestionService, LocationSuggestionService],
})
export class RoleSuggestionModule {}
