import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import {
  AttendanceStatus,
  MeetingStatus,
  NotificationType,
} from '../../generated/prisma/enums';
import { GroupClockService } from './group-clock.service';
import { appPath } from '../notification/app-paths';
import { CRON_TIME_ZONE } from '../common/time/local-evening';
import { addDays, finishedBefore } from './meeting-schedule';
import type { ReminderRunResult } from '../notification/meeting-reminder.service';

/**
 * Wie weit zurück noch erinnert wird.
 *
 * Drei Tage: Am Morgen danach ist die Frage frisch, am dritten noch zu
 * beantworten. Ohne die Grenze erinnerte der Lauf im Mai an einen Abend im
 * Februar, wenn eine Gruppe eine Pause gemacht hat — und die Nachfrage nach
 * einem Actionstep, an den sich niemand erinnert, ist keine Erinnerung, sondern
 * ein Vorwurf.
 */
const MAX_TAGE = 3;

/**
 * „Wie war der Abend?" — die Nachfrage nach der Nachbereitung.
 *
 * **Nur an Abenden ohne Thema.** Hat der Abend eines, gehören Zusammenfassung
 * und Actionstep der Einheit, und schreiben darf sie nur deren Crew (Owner,
 * Mitwirkende, Crew der Einheit). Eine Aufforderung an alle wäre dort eine
 * Einladung in eine Fehlermeldung. Ohne Thema darf dagegen jede:r schreiben —
 * die Nachbereitung hängt am Abend selbst.
 *
 * **An die, die zugesagt hatten.** Wer nicht da war, kann nicht
 * zusammenfassen; die Zusammenfassung ist ja gerade für ihn geschrieben.
 *
 * **Und nur, wenn noch nichts dasteht.** Steht schon etwas, ist die Frage
 * beantwortet — auch wenn nur eins der beiden Felder gefüllt ist: Nicht jeder
 * Abend hat beides, manchmal gibt es nur einen Vorsatz.
 *
 * Der Baustein selbst muss dabei **nicht** an sein: Er lässt sich mit einem
 * Klick auf der Terminseite dazuschalten, und genau dorthin führt die
 * Nachricht. Ihn zur Bedingung zu machen hieße, nur die zu erinnern, die schon
 * angefangen haben.
 */
@Injectable()
export class NotesReminderService {
  private readonly logger = new Logger(NotesReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly clock: GroupClockService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM, {
    name: 'notes-reminders',
    timeZone: CRON_TIME_ZONE,
  })
  async handleCron(): Promise<void> {
    const hauskreise = await this.prisma.hauskreis.findMany({
      select: { id: true },
    });

    await Promise.all(
      hauskreise.map((hauskreis) => this.sendDueReminders(hauskreis.id)),
    );
  }

  async sendDueReminders(
    hauskreisId: string,
    options: { now?: Date } = {},
  ): Promise<ReminderRunResult> {
    const today = await this.clock.today(hauskreisId, options.now);

    const meeting = await this.prisma.meeting.findFirst({
      where: {
        hauskreisId,
        ...finishedBefore(today),
        date: { gte: addDays(today, -MAX_TAGE) },
        status: { not: MeetingStatus.CANCELLED },
        hasTopicSlot: false,
        summaryText: null,
        actionstepText: null,
      },
      orderBy: { date: 'desc' },
      select: {
        id: true,
        attendances: {
          where: { status: AttendanceStatus.ATTENDING },
          select: { personId: true },
        },
      },
    });

    if (!meeting || meeting.attendances.length === 0) {
      return { notified: 0, skipped: 0 };
    }

    const results = await Promise.all(
      meeting.attendances.map((row) =>
        this.notifications.notify({
          personId: row.personId,
          type: NotificationType.NOTES_REMINDER,
          relatedMeetingId: meeting.id,
          payload: {
            title: 'Wie war der Abend?',
            body: 'Haltet fest, worum es ging — und was ihr euch für die Woche vornehmt.',
            url: appPath.meeting(meeting.id),
          },
        }),
      ),
    );

    const outcome = results.reduce(
      (total, result) => ({
        notified: total.notified + (result.skipped === 0 ? 1 : 0),
        skipped: total.skipped + result.skipped,
      }),
      { notified: 0, skipped: 0 },
    );

    if (outcome.notified > 0) {
      this.logger.log(`Sent ${outcome.notified} notes reminder(s)`);
    }

    return outcome;
  }
}
