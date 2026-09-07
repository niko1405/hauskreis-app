import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  MeetingReminderService,
  type ReminderRunOptions,
  type ReminderRunResult,
} from '../notification/meeting-reminder.service';
import { snackReminderBody } from '../notification/reminder-copy';
import { NotificationType } from '../../generated/prisma/enums';
import { appPath } from '../notification/app-paths';
import { CRON_TIME_ZONE } from '../common/time/local-evening';

/**
 * Erinnert daran, dass man etwas zu essen mitbringen wollte.
 *
 * Gebaut wie `SongReminderService`, und aus demselben Grund kurz: Mehrere Leute
 * je Abend sind möglich, jede:r bekommt seine eigene Nachricht, und ein Abend
 * ohne den Baustein hat niemanden — dann geht nichts raus. Das ist ein gültiger
 * Zustand und keine Lücke.
 *
 * Die Vorlaufzeit ist mit zwei Tagen kürzer als beim Hosten (drei) und beim
 * Thema: Einkaufen ist ein Gang, kein Vorbereiten. Wer möchte, stellt sie im
 * Profil um.
 */
@Injectable()
export class SnackReminderService {
  constructor(private readonly reminders: MeetingReminderService) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM, {
    name: 'snack-reminders',
    timeZone: CRON_TIME_ZONE,
  })
  async handleCron(): Promise<void> {
    await this.sendDueReminders();
  }

  sendDueReminders(
    options: ReminderRunOptions = {},
  ): Promise<ReminderRunResult> {
    return this.reminders.run(
      NotificationType.SNACK_REMINDER,
      (meeting) =>
        meeting.snackResponsibles.map((row) => ({
          personId: row.personId,
          payload: {
            title: 'Du bringst was zu essen mit',
            body: snackReminderBody(meeting.date),
            url: appPath.meeting(meeting.id),
          },
        })),
      options,
    );
  }
}
