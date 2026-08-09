import { Module } from '@nestjs/common';
import { TopicController } from './topic.controller';
import { MeetingTopicController } from './meeting-topic.controller';
import { TopicService } from './topic.service';
import { TopicSessionService } from './topic-session.service';
import { TopicReminderService } from './topic-reminder.service';
import { TopicLinkModule } from './topic-link.module';
import { NotificationModule } from '../notification/notification.module';
import { RoleSuggestionModule } from '../role-suggestion/role-suggestion.module';

/**
 * Themen, ihre Einheiten und die Rolle „Thema" am einzelnen Abend.
 *
 * Was hier **nicht** liegt: die Rangfolge für „wer bereitet das nächste Thema
 * vor" steht im `RoleSuggestionModule` und ist dieselbe Funktion, die auch
 * Gastgeber sortiert — nur Ereignis-Adapter und Eignungsfilter unterscheiden
 * sich. Von dort kommt allerdings `AvailabilityService`: wer an dem Abend nicht
 * da ist, kann das Thema nicht vorbereiten.
 *
 * `MeetingTopicController` hängt an Termin-Pfaden, gehört aber hierher — wie die
 * Musik im `SongModule`. Das `MeetingModule` weiß dadurch von Themen nichts,
 * und der Modulgraph bleibt ohne Kante zwischen den beiden.
 *
 * Auch weg: die nächtliche Übernahme des laufenden Themas. Sie belegte den
 * nächsten Abend im Voraus und stand damit der Regel im Weg, dass Owner wird,
 * wer zuerst wählt.
 */
@Module({
  imports: [NotificationModule, RoleSuggestionModule, TopicLinkModule],
  controllers: [TopicController, MeetingTopicController],
  providers: [TopicService, TopicSessionService, TopicReminderService],
  exports: [TopicService, TopicSessionService, TopicReminderService],
})
export class TopicModule {}
