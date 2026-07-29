import { Module } from '@nestjs/common';
import { TopicController } from './topic.controller';
import { TopicService } from './topic.service';
import { TopicCarryOverService } from './topic-carry-over.service';
import { TopicReminderService } from './topic-reminder.service';
import { NotificationModule } from '../notification/notification.module';

/**
 * Owns topics and the carry-over that keeps a running one on the next meeting.
 *
 * Note what is *not* here: the ranking for "wer bereitet das nächste Thema vor"
 * lives in `RoleSuggestionModule` and is the very same function that ranks
 * hosts — only the event adapter and the eligibility filter differ.
 */
@Module({
  imports: [NotificationModule],
  controllers: [TopicController],
  providers: [TopicService, TopicCarryOverService, TopicReminderService],
  exports: [TopicService, TopicReminderService],
})
export class TopicModule {}
