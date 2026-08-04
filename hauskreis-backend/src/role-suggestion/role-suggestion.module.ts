import { Module } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { RoleSuggestionService } from './role-suggestion.service';

/**
 * The shared suggestion engine, imported by `MeetingModule`, `TopicModule` and
 * `SongModule` — each of those adds an event adapter here instead of writing
 * its own ranking.
 *
 * `AvailabilityService` gehört dazu, weil beide Seiten dieselbe Frage stellen:
 * die Vorschläge, um Abwesende nicht anzubieten, und die Zuteilung, um sie
 * nicht anzunehmen. Zwei Antworten darauf wären eine zu viel.
 */
@Module({
  providers: [RoleSuggestionService, AvailabilityService],
  exports: [RoleSuggestionService, AvailabilityService],
})
export class RoleSuggestionModule {}
