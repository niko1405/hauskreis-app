import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  MeetingReminderService,
  type ReminderRunOptions,
  type ReminderRunResult,
} from '../notification/meeting-reminder.service';
import { testimonyReminderBody } from '../notification/reminder-copy';
import { NotificationType } from '../../generated/prisma/enums';
import { appPath } from '../notification/app-paths';
import { CRON_TIME_ZONE } from '../common/time/local-evening';

/**
 * Erinnert die Person, die an einem Abend ihr Testimony erzählt.
 *
 * Dieselbe Vorlaufzeit wie beim Thema und aus demselben Grund: was man erzählen
 * will, sortiert man nicht am Abend selbst. Eine Person je Abend, oft gar
 * keine — dann geht nichts raus, und das ist ein gültiger Zustand.
 */
@Injectable()
export class TestimonyReminderService {
  constructor(private readonly reminders: MeetingReminderService) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM, {
    name: 'testimony-reminders',
    timeZone: CRON_TIME_ZONE,
  })
  async handleCron(): Promise<void> {
    await this.sendDueReminders();
  }

  sendDueReminders(
    options: ReminderRunOptions = {},
  ): Promise<ReminderRunResult> {
    return this.reminders.run(
      NotificationType.TESTIMONY_REMINDER,
      (meeting) =>
        meeting.testimonyPersonId
          ? [
              {
                personId: meeting.testimonyPersonId,
                payload: {
                  title: 'Du erzählst dein Testimony',
                  body: testimonyReminderBody(meeting.date),
                  url: appPath.meeting(meeting.id),
                },
              },
            ]
          : [],
      options,
    );
  }
}
