import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  MeetingReminderService,
  type ReminderRunOptions,
  type ReminderRunResult,
} from '../notification/meeting-reminder.service';
import { songReminderBody } from '../notification/reminder-copy';
import { NotificationType } from '../../generated/prisma/enums';

/**
 * Reminds whoever leads the songs, a few days before the evening.
 *
 * An evening can have several song leaders and each one is told; an evening
 * without music has none and nothing goes out — that is a valid state, not a
 * gap to fill.
 */
@Injectable()
export class SongReminderService {
  constructor(private readonly reminders: MeetingReminderService) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM, { name: 'song-reminders' })
  async handleCron(): Promise<void> {
    await this.sendDueReminders();
  }

  sendDueReminders(
    options: ReminderRunOptions = {},
  ): Promise<ReminderRunResult> {
    return this.reminders.run(
      NotificationType.SONG_REMINDER,
      (meeting) =>
        meeting.songLeaders.map((leader) => ({
          personId: leader.personId,
          payload: {
            title: 'Du machst die Musik',
            body: songReminderBody(meeting.date),
            url: `/meetings/${meeting.id}`,
          },
        })),
      options,
    );
  }
}
