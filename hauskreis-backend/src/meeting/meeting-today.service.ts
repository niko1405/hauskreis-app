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
import { formatWallClock } from '../common/time/wall-clock';
import { ANGEKOMMEN } from '../person/angekommen';
import type { ReminderRunResult } from '../notification/meeting-reminder.service';

/**
 * Was am Morgen des Termintags in der Nachricht steht — je nach dem, was man
 * selbst geantwortet hat.
 *
 * **Der zweite Satz ist der eigentliche Punkt.** Eine Erinnerung „heute ist
 * Hauskreis" wüsste man auch so; was am Termintag wirklich passiert, ist, dass
 * sich Zusagen ändern. Wer abgesagt hat, wird deshalb gefragt, ob das noch
 * stimmt — und wer nie geantwortet hat, überhaupt einmal.
 */
function body(status: AttendanceStatus, wann: string, wo: string): string {
  const kopf = `Heute um ${wann} ${wo}.`;

  switch (status) {
    case AttendanceStatus.ATTENDING:
      return `${kopf} Bis später!`;
    case AttendanceStatus.ABSENT:
      return `${kopf} Du hast abgesagt — stimmt das noch?`;
    case AttendanceStatus.UNKNOWN:
      return `${kopf} Bist du dabei?`;
  }
}

/**
 * „Heute ist Hauskreis" — am Morgen des Termintags, an alle.
 *
 * **Der eine Tag, an dem die App bisher schwieg.** Die Erinnerungen davor
 * gehen an die, die etwas vorbereiten müssen: Gastgeber, Thema, Musik,
 * Testimony. Am Tag selbst hat niemand mehr etwas vorzubereiten — aber alle
 * müssen sich entscheiden, und genau dort entstand das WhatsApp-Hin-und-Her,
 * gegen das diese App gebaut ist.
 *
 * **Ein Ereignis und keine Vorlaufzeit** (`schedule: EVENT` im Katalog): „am
 * Tag selbst" ist die ganze Aussage, es gibt nichts einzustellen außer an und
 * aus.
 *
 * **Nur der Anfangstag zählt.** Eine Freizeit von Freitag bis Sonntag meldet
 * sich am Freitag, nicht an drei Morgen hintereinander — die Entdopplung über
 * `relatedMeetingId` hielte das ohnehin ab, aber die Abfrage sagt es schon.
 */
@Injectable()
export class MeetingTodayService {
  private readonly logger = new Logger(MeetingTodayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly clock: GroupClockService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM, {
    name: 'meeting-today-reminders',
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
      where: { hauskreisId, date: today, status: MeetingStatus.PLANNED },
      select: {
        id: true,
        startMinutes: true,
        location: { select: { name: true } },
        attendances: { select: { personId: true, status: true } },
      },
    });

    if (!meeting) return { notified: 0, skipped: 0 };

    // Dieselbe Menge wie in der Anwesenheitsliste am Termin: Wer sich noch nie
    // angemeldet hat, kann heute Abend nicht kommen und bekommt auch keine
    // Nachricht darüber.
    const people = await this.prisma.person.findMany({
      where: { hauskreisId, ...ANGEKOMMEN },
      select: { id: true },
    });

    const answers = new Map(
      meeting.attendances.map((row) => [row.personId, row.status]),
    );

    const wann = formatWallClock(meeting.startMinutes);
    // Ohne Ort steht dort dieselbe Auskunft wie überall sonst in der App.
    const wo = meeting.location
      ? `bei ${meeting.location.name}`
      : 'ist Hauskreis — der Ort ist noch offen';

    const results = await Promise.all(
      people.map((person) =>
        this.notifications.notify({
          personId: person.id,
          type: NotificationType.MEETING_TODAY,
          relatedMeetingId: meeting.id,
          payload: {
            title: 'Heute ist Hauskreis',
            body: body(
              answers.get(person.id) ?? AttendanceStatus.UNKNOWN,
              wann,
              wo,
            ),
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
      this.logger.log(
        `Sent ${outcome.notified} „heute ist Hauskreis" push(es)`,
      );
    }

    return outcome;
  }
}
