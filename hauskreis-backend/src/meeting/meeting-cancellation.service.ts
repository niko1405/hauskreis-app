import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AttendanceStatus,
  MeetingCancelSource,
  MeetingStatus,
} from '../../generated/prisma/enums';
import { ANGEKOMMEN } from '../person/angekommen';
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

    // Zähler und Nenner müssen dieselbe Menge meinen, sonst wird die Schwelle
    // nie erreicht. Eingeladene stehen in keiner von beiden: Wer sich noch nie
    // angemeldet hat, kann nicht absagen — und hielte damit dauerhaft einen
    // Abend am Leben, den alle anderen abgesagt haben.
    const [active, declined] = await Promise.all([
      this.prisma.person.count({
        where: { hauskreisId: meeting.hauskreisId, ...ANGEKOMMEN },
      }),
      this.prisma.meetingAttendance.count({
        where: {
          meetingId,
          status: AttendanceStatus.ABSENT,
          person: ANGEKOMMEN,
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

  /**
   * Alle Abende ansehen, die die App selbst abgesagt hat.
   *
   * **Für Änderungen, die keine Anwesenheit anfassen.** `reconcile` hängt an
   * einem einzelnen Termin und wird gerufen, wenn jemand seine Antwort ändert.
   * Zwei Wege ändern das Ergebnis aber, ohne eine Antwort anzufassen, und
   * beide sind zuletzt aufgefallen:
   *
   *   * **Der Schalter „ich bin grundsätzlich dabei".** Er füllt kommende
   *     Abende mit Zusagen auf (`AutoAttendanceService`), auch abgesagte — und
   *     danach passierte nichts. Der Abend blieb ausgefallen, obwohl jemand
   *     zugesagt hatte.
   *   * **Wer ankommt, ändert den Nenner.** Hier wird gezählt, wie viele
   *     Absagen es gibt und wie viele Menschen es gibt; eine Person mehr macht
   *     aus „alle haben abgesagt" ein „fast alle". Beim ersten Anmelden und
   *     beim Annehmen einer Einladung geschieht das, ohne dass irgendwer seine
   *     Anwesenheit ändert.
   *
   * **Nur aufwecken, nie absagen** — deshalb die enge Abfrage. Zusagen und
   * Zugänge können eine Absage auflösen, aber keine auslösen. Wer geht, ist
   * der umgekehrte Fall, und den erledigt `leave` schon Termin für Termin.
   */
  async reviveUpcoming(hauskreisId: string): Promise<void> {
    const today = await this.clock.today(hauskreisId);

    const cancelled = await this.prisma.meeting.findMany({
      where: {
        hauskreisId,
        date: { gte: today },
        status: MeetingStatus.CANCELLED,
        // Eine Absage von Hand bleibt eine Absage. Zurückgenommen wird nur,
        // was die App selbst geschlossen hat.
        cancelSource: MeetingCancelSource.ALL_DECLINED,
      },
      select: { id: true },
    });

    for (const meeting of cancelled) {
      await this.reconcile(meeting.id);
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
