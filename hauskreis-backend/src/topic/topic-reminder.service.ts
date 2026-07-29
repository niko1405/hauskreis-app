import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  MeetingReminderService,
  type ReminderRunOptions,
  type ReminderRunResult,
} from '../notification/meeting-reminder.service';
import { topicReminderBody } from '../notification/reminder-copy';
import { NotificationType } from '../../generated/prisma/enums';

/**
 * Reminds whoever prepares the topic, a few days before the evening.
 *
 * The role with the most preparation was the only one nobody was told about:
 * `TOPIC_REMINDER` sat in the enum from Phase 3 onwards without a sender.
 *
 * A topic can run over several meetings, and the reminder follows it — being
 * reminded again for part two is the point, not a repeat. Deduplication is per
 * meeting, so that works without any special case.
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
        (meeting.topic?.responsibles ?? []).map((responsible) => ({
          personId: responsible.personId,
          payload: {
            title: 'Du bist dran mit dem Thema',
            body: topicReminderBody(meeting.date, meeting.topic?.title ?? null),
            url: `/meetings/${meeting.id}`,
          },
        })),
      options,
    );
  }
}
