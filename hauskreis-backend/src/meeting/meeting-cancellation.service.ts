import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AttendanceStatus,
  MeetingCancelSource,
  MeetingStatus,
} from '../../generated/prisma/enums';
import { MeetingNotificationService } from './meeting-notification.service';
import { GroupClockService } from './group-clock.service';

/**
 * Der Abend, den niemand absagt und der trotzdem ausfällt.
 *
 * Wenn alle abgesagt haben, ist der Termin faktisch weg — aber im Kalender
 * steht er weiter, und irgendwer muss daran denken, ihn abzusagen. Genau das
 * passiert nicht. Also zieht die App den Schluss selbst.
 *
 * **Alle heißt alle.** Wer noch nicht geantwortet hat, verhindert die Absage.
 * Das ist die vorsichtige Lesart und die richtige: „vier von neun haben
 * abgesagt" ist ein dünner Abend, kein ausgefallener, und ein Termin, den die
 * App aus Schweigen heraus absagt, wäre schlimmer als einer, der zu dritt
 * stattfindet.
 *
 * Die Gegenrichtung gehört zwingend dazu. Sagt danach jemand doch zu, lebt der
 * Abend wieder auf — sonst müsste ein Mensch eine Absage zurücknehmen, die nie
 * jemand ausgesprochen hat. Zurückgenommen wird aber nur, was die App selbst
 * abgesagt hat (`ALL_DECLINED`); eine Absage von Hand bleibt stehen.
 */
@Injectable()
export class MeetingCancellationService {
  private readonly logger = new Logger(MeetingCancellationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: MeetingNotificationService,
    private readonly clock: GroupClockService,
  ) {}

  /**
   * Gleicht den Zustand eines Abends mit den Zusagen ab.
   *
   * Aufgerufen nach jeder Änderung an der Anwesenheit — von Hand wie aus einem
   * Abwesenheitszeitraum heraus. Tut in aller Regel nichts.
   */
  async reconcile(meetingId: string): Promise<void> {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        id: true,
        hauskreisId: true,
        date: true,
        status: true,
        cancelSource: true,
      },
    });

    // Vergangene Abende in Ruhe lassen: dort ist „abgesagt" ein Vermerk fürs
    // Archiv, keine Vorhersage, und nachträgliche Anwesenheit ist genau das
    // Nachtragen, das den Vermerk nicht umstoßen soll.
    if (
      !meeting ||
      (await this.clock.isPast(meeting.hauskreisId, meeting.date))
    ) {
      return;
    }

    const [active, declined] = await Promise.all([
      this.prisma.person.count({
        where: { hauskreisId: meeting.hauskreisId, active: true },
      }),
      this.prisma.meetingAttendance.count({
        where: {
          meetingId,
          status: AttendanceStatus.ABSENT,
          person: { active: true },
        },
      }),
    ]);

    // `active > 0`, damit ein leerer Hauskreis nicht jeden Termin absagt.
    const everybodyOut = active > 0 && declined >= active;

    if (everybodyOut && meeting.status === MeetingStatus.PLANNED) {
      await this.cancelBecauseEverybodyDeclined(meeting.id);
      return;
    }

    if (
      !everybodyOut &&
      meeting.status === MeetingStatus.CANCELLED &&
      meeting.cancelSource === MeetingCancelSource.ALL_DECLINED
    ) {
      await this.revive(meeting.id);
    }
  }

  private async cancelBecauseEverybodyDeclined(meetingId: string) {
    await this.prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: MeetingStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledByPersonId: null,
        cancelSource: MeetingCancelSource.ALL_DECLINED,
        cancelReason: null,
        // Der ETag muss mitwandern, sonst schreibt jemand mit einem Stand von
        // vorhin über eine Absage hinweg, von der er nichts weiß.
        version: { increment: 1 },
      },
    });

    this.logger.log(`Meeting ${meetingId} cancelled: everybody declined`);
    await this.notifications.announceCancellation(meetingId);
  }

  private async revive(meetingId: string) {
    await this.prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: MeetingStatus.PLANNED,
        cancelledAt: null,
        cancelledByPersonId: null,
        cancelSource: null,
        cancelReason: null,
        version: { increment: 1 },
      },
    });

    this.logger.log(`Meeting ${meetingId} back on: somebody is coming again`);
    await this.notifications.announceRevival(meetingId);
  }
}
