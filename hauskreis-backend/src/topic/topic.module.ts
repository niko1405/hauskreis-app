import { Module } from '@nestjs/common';
import { TopicController } from './topic.controller';
import { TopicService } from './topic.service';
import { TopicCarryOverService } from './topic-carry-over.service';
import { TopicReminderService } from './topic-reminder.service';
import { NotificationModule } from '../notification/notification.module';
import { PersonModule } from '../person/person.module';
import { RoleSuggestionModule } from '../role-suggestion/role-suggestion.module';

/**
 * Owns topics and the carry-over that keeps a running one on the next meeting.
 *
 * Note what is *not* here: the ranking for "wer bereitet das nächste Thema vor"
 * lives in `RoleSuggestionModule` and is the very same function that ranks
 * hosts — only the event adapter and the eligibility filter differ. Von dort
 * kommt allerdings `AvailabilityService`: wer an dem Abend nicht da ist, kann
 * das Thema nicht vorbereiten.
 */
@Module({
  // PersonModule: wer einträgt, steht im Token — und bekommt keine Nachricht
  // darüber, dass er selbst eingetragen hat.
  imports: [NotificationModule, PersonModule, RoleSuggestionModule],
  controllers: [TopicController],
  providers: [TopicService, TopicCarryOverService, TopicReminderService],
  exports: [TopicService, TopicReminderService],
})
export class TopicModule {}
