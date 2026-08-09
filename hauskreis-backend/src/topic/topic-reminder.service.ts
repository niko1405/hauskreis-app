import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  MeetingReminderService,
  type ReminderRunOptions,
  type ReminderRunResult,
} from '../notification/meeting-reminder.service';
import { topicReminderBody } from '../notification/reminder-copy';
import { NotificationType } from '../../generated/prisma/enums';
import { appPath } from '../notification/app-paths';

/**
 * Reminds whoever prepares the topic, a few days before the evening.
 *
 * The role with the most preparation was the only one nobody was told about:
 * `TOPIC_REMINDER` sat in the enum from Phase 3 onwards without a sender.
 *
 * A topic can run over several meetings, and the reminder follows it — being
 * reminded again for part two is the point, not a repeat. Deduplication is per
 * meeting, so that works without any special case.
 *
 * Empfänger sind die **Zuteilung** am Abend, nicht die Leute am Thema. Das ist
 * seit dem Einheiten-Modell zweierlei, und die Erinnerung meint das erste: sie
 * geht auch an jemanden, der noch gar nichts gewählt hat — für den ist sie am
 * nötigsten.
 */
@Injectable()
export class TopicReminderService {
  constructor(private readonly reminders: MeetingReminderService) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM, { name: 'topic-reminders' })
  async handleCron(): Promise<void> {
    await this.sendDueReminders();
  }

  sendDueReminders(
    options: ReminderRunOptions = {},
  ): Promise<ReminderRunResult> {
    return this.reminders.run(
      NotificationType.TOPIC_REMINDER,
      (meeting) =>
        meeting.topicResponsibles.map((responsible) => ({
          personId: responsible.personId,
          payload: {
            title: 'Du bist dran mit dem Thema',
            body: topicReminderBody(
              meeting.date,
              // Der Titel des Abends, sonst der des Themas. Steht noch nichts
              // fest, bleibt es beim Datum — dann gibt es nichts zu nennen.
              meeting.topicSession?.title ??
                meeting.topicSession?.topic.title ??
                null,
            ),
            url: appPath.meeting(meeting.id),
          },
        })),
      options,
    );
  }
}
