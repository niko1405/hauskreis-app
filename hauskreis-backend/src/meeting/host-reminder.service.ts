import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  MeetingReminderService,
  type ReminderRunOptions,
  type ReminderRunResult,
} from '../notification/meeting-reminder.service';
import { hostReminderBody } from '../notification/reminder-copy';
import { NotificationType } from '../../generated/prisma/enums';
import { appPath } from '../notification/app-paths';

/**
 * Reminds hosts before the evening happens at their place.
 *
 * The scan window, each person's lead time and the deduplication all live in
 * `MeetingReminderService`; what is left here is who the reminder concerns and
 * what it says. How many days ahead it goes out is no longer a constant — it
 * is a per-person setting, defaulting to the catalog's three days.
 */
@Injectable()
export class HostReminderService {
  constructor(private readonly reminders: MeetingReminderService) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM, { name: 'host-reminders' })
  async handleCron(): Promise<void> {
    await this.sendDueReminders();
  }

  sendDueReminders(
    options: ReminderRunOptions = {},
  ): Promise<ReminderRunResult> {
    return this.reminders.run(
      NotificationType.HOST_REMINDER,
      (meeting) =>
        meeting.hostPersonId
          ? [
              {
                personId: meeting.hostPersonId,
                payload: {
                  title: 'Du bist dran mit Hosten',
                  body: hostReminderBody(
                    meeting.date,
                    meeting.location?.name ?? null,
                  ),
                  url: appPath.meeting(meeting.id),
                },
              },
            ]
          : [],
      options,
    );
  }
}
