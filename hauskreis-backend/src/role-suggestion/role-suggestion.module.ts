import { Module } from '@nestjs/common';
import { RoleSuggestionService } from './role-suggestion.service';

/**
 * The shared suggestion engine. Imported by `MeetingModule` today and by
 * `TopicModule`/`SongModule` from Phase 5 on — each of those adds an event
 * adapter here instead of writing its own ranking.
 */
@Module({
  providers: [RoleSuggestionService],
  exports: [RoleSuggestionService],
})
export class RoleSuggestionModule {}
