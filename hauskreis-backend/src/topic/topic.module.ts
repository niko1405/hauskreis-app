import { Module } from '@nestjs/common';
import { TopicController } from './topic.controller';
import { TopicService } from './topic.service';
import { TopicCarryOverService } from './topic-carry-over.service';

/**
 * Owns topics and the carry-over that keeps a running one on the next meeting.
 *
 * Note what is *not* here: the ranking for "wer bereitet das nächste Thema vor"
 * lives in `RoleSuggestionModule` and is the very same function that ranks
 * hosts — only the event adapter and the eligibility filter differ.
 */
@Module({
  controllers: [TopicController],
  providers: [TopicService, TopicCarryOverService],
  exports: [TopicService],
})
export class TopicModule {}
