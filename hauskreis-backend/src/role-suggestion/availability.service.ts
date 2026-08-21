import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AttendanceSource,
  AttendanceStatus,
} from '../../generated/prisma/enums';
import { AbsenceCalendar } from '../absence/absence-window';
import { GroupClockService } from '../meeting/group-clock.service';

/**
 * Wer an einem Abend da ist — und wer deshalb eine Rolle übernehmen kann.
 *
 * **Zwei Gründe, aus denen jemand keine übernehmen kann**, und sie sind
 * verschieden groß. Der eine gilt für einen Abend: die Person hat abgesagt oder
 * ist verreist. Der andere gilt für die Person: sie war überhaupt noch nie da —
 * eine offene Einladung, ein Konto, in das sich niemand angemeldet hat
 * (`assertArrived`). Deshalb hängt der zweite auch nicht am Datum: Nachtragen
 * ändert nichts daran, dass da niemand war.
 *
 * Bis hierher prüfte **keine** der drei Zuteilungen, ob die Person überhaupt
 * kommt: `resolveVenue`, `setLeaders` und `TopicService.update` sahen nur nach,
 * ob sie zum Hauskreis gehört. Man konnte also jemanden als Gastgeber
 * eintragen, der für genau diesen Dienstag abgesagt hatte — und niemand merkte
 * es bis zum Abend.
 *
 * Zwei Quellen sagen „nicht da", und beide zählen:
 *
 * - eine **Absage für diesen Abend** (`MeetingAttendance.ABSENT`), egal ob von
 *   Hand oder aus einem Abwesenheitszeitraum abgeleitet;
 * - ein **Abwesenheitszeitraum**, der das Datum abdeckt.
 *
 * Die zweite ist streng genommen die Quelle der ersten — der `AbsenceSyncService`
 * schreibt Zeiträume in Absagen um. Trotzdem beide zu fragen kostet eine kleine
 * Abfrage und deckt das Fenster ab, in dem ein frisch erzeugter Termin noch
 * keine abgeleitete Zeile hat.
 *
 * **Und eine Ausnahme: die ausdrückliche Zusage sticht den Zeitraum.** „Doch,
 * ich komme an dem Abend" ist eine Aussage über genau diesen Abend, der Urlaub
 * eine über viele — überall sonst gewinnt deshalb die Antwort von Hand, und der
 * Abgleich fasst eine `SELF`-Zeile nie an. Hier wurde der Zeitraum getrennt
 * gefragt und schlug sie: Wer aus dem Urlaub heraus zusagte, fiel weiter aus
 * jeder Vorschlagsliste, und das Eintragen wäre auch abgelehnt worden.
 *
 * Nur die **Zusage**, nicht jede eigene Antwort. Ein „weiß noch nicht" von Hand
 * sagt nicht, dass jemand zurück ist — und es entsteht sogar von selbst: Wird
 * ein Abend wiederbelebt, macht `uncancel` aus jeder Absage von Hand genau das.
 */
@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: GroupClockService,
  ) {}

  /**
   * Wer von diesen an dem Abend **dabei sein kann** — dieselbe Frage wie
   * `assertAvailable`, nur als Antwort statt als Fehler.
   *
   * Für den einen Aufrufer, der nicht scheitern darf: Wer auf der Seite einer
   * Einheit jemanden zur Vorbereitung dazunimmt, sagt damit nichts über dessen
   * Anwesenheit — mitvorbereiten kann man auch, wenn man am Abend selbst fehlt.
   * Die Kopplung in die Abend-Rolle überspringt so jemanden dann einfach, statt
   * das Dazunehmen abzulehnen.
   */
  async findAvailable(
    hauskreisId: string,
    meetingId: string,
    personIds: readonly string[],
  ): Promise<string[]> {
    if (personIds.length === 0) return [];

    const meeting = await this.prisma.meeting.findFirst({
      where: { id: meetingId, hauskreisId },
      select: { date: true },
    });

    if (!meeting) return [];

    const [away, angekommen] = await Promise.all([
      this.findUnavailable(hauskreisId, meeting.date, meetingId, personIds),
      this.prisma.person.findMany({
        where: {
          id: { in: [...personIds] },
          hauskreisId,
          acceptedAt: { not: null },
        },
        select: { id: true },
      }),
    ]);

    const weg = new Set(away.map((person) => person.id));
    return angekommen
      .map((person) => person.id)
      .filter((personId) => !weg.has(personId));
  }

  /**
   * Wirft `400`, sobald jemand aus der Liste an diesem Abend nicht da ist.
   *
   * Die Meldung nennt Namen und Grund: „Mira ist an diesem Abend nicht dabei"
   * ist eine Antwort, mit der man etwas anfangen kann — „400 Bad Request" nicht.
   */
  async assertAvailable(
    hauskreisId: string,
    meetingId: string,
    personIds: readonly string[],
  ): Promise<void> {
    if (personIds.length === 0) return;

    // Zuerst und ohne Rücksicht auf das Datum: eine offene Einladung ist keine
    // Person, der man einen Abend anvertrauen kann — auch rückwirkend nicht.
    await this.assertArrived(hauskreisId, personIds);

    const meeting = await this.prisma.meeting.findFirst({
      where: { id: meetingId, hauskreisId },
      select: { date: true },
    });

    // Kein Termin, kein Abend, an dem jemand fehlen könnte. Dass es ihn gibt,
    // haben die Aufrufer ohnehin schon geprüft.
    if (!meeting) return;

    const away = await this.findUnavailable(
      hauskreisId,
      meeting.date,
      meetingId,
      personIds,
    );

    if (away.length === 0) return;

    const names = away.map((person) => person.name).join(', ');

    throw new BadRequestException(
      away.length === 1
        ? `${names} ist an diesem Abend nicht dabei — wer nicht da ist, kann die Rolle nicht übernehmen.`
        : `${names} sind an diesem Abend nicht dabei — wer nicht da ist, kann die Rolle nicht übernehmen.`,
    );
  }

  /**
   * Wirft `400`, sobald jemand aus der Liste noch nie hier war.
   *
   * Eine Einladung legt Zeile und Konto an, aber niemanden, der sie annimmt.
   * Bis das jemand tut, ist die Person eine Adresse — sie kann nicht zusagen,
   * bekommt keine Benachrichtigung und weiß von keiner Zuteilung. Sie
   * trotzdem eintragen zu können hieß, einen Abend für erledigt zu halten, für
   * den in Wahrheit niemand zuständig ist.
   *
   * Öffentlich, weil zwei Wege hierher führen: die Prüfung auf Anwesenheit
   * (Gastgeber beim Ändern, Musik, Thema) und die Mandantengrenze beim Anlegen
   * eines Termins (Gastgeber und Testimony, `MeetingService`).
   */
  async assertArrived(
    hauskreisId: string,
    personIds: readonly string[],
  ): Promise<void> {
    if (personIds.length === 0) return;

    const pending = await this.prisma.person.findMany({
      where: {
        id: { in: [...personIds] },
        hauskreisId,
        acceptedAt: null,
      },
      select: { name: true },
    });

    if (pending.length === 0) return;

    const names = pending.map((person) => person.name).join(', ');

    throw new BadRequestException(
      pending.length === 1
        ? `${names} hat die Einladung noch nicht angenommen — bis dahin lässt sich keine Rolle eintragen.`
        : `${names} haben ihre Einladungen noch nicht angenommen — bis dahin lässt sich keine Rolle eintragen.`,
    );
  }

  /**
   * Wer von den Genannten an dem Abend fehlt, mit Namen für die Meldung.
   *
   * Für einen **vergangenen** Abend gilt die Regel nicht: dort wird nachgetragen,
   * was war, und wer damals absagte, kann trotzdem gehostet haben (etwa weil er
   * doch noch kam). Nachtragen ist Buchführung, keine Planung.
   */
  private async findUnavailable(
    hauskreisId: string,
    date: Date,
    meetingId: string,
    personIds: readonly string[],
  ): Promise<{ id: string; name: string }[]> {
    if (await this.clock.isPast(hauskreisId, date)) return [];

    const [answers, periods, people] = await Promise.all([
      // Beide Antworten in einer Abfrage: die Absage sperrt, die ausdrückliche
      // Zusage macht den Zeitraum stumm.
      this.prisma.meetingAttendance.findMany({
        where: { meetingId, personId: { in: [...personIds] } },
        select: { personId: true, status: true, source: true },
      }),
      this.prisma.absencePeriod.findMany({
        where: { hauskreisId, personId: { in: [...personIds] } },
        select: { personId: true, startDate: true, endDate: true },
      }),
      this.prisma.person.findMany({
        where: { id: { in: [...personIds] } },
        select: { id: true, name: true },
      }),
    ]);

    const declinedIds = new Set(
      answers
        .filter((row) => row.status === AttendanceStatus.ABSENT)
        .map((row) => row.personId),
    );

    const calendar = new AbsenceCalendar(periods).exceptOn(
      date,
      selfAttending(answers),
    );

    return people.filter(
      (person) =>
        declinedIds.has(person.id) || calendar.isAway(person.id, date),
    );
  }

  /**
   * Wer für diesen Abend abgesagt hat. Für die Vorschlagslisten: vorschlagen,
   * was der Server danach ablehnt, wäre eine Falle.
   */
  async findDeclined(meetingId: string | undefined): Promise<Set<string>> {
    if (!meetingId) return new Set();

    const rows = await this.prisma.meetingAttendance.findMany({
      where: { meetingId, status: AttendanceStatus.ABSENT },
      select: { personId: true },
    });

    return new Set(rows.map((row) => row.personId));
  }

  /**
   * Wer für diesen Abend **von Hand** zugesagt hat — die Menge, die einen
   * Abwesenheitszeitraum sticht (`AbsenceCalendar.exceptOn`).
   *
   * Für die Vorschlagslisten, die den Kalender selbst befragen. Der Gegenpol zu
   * `findDeclined`: die eine sperrt, die andere gibt frei.
   */
  async findSelfAttending(meetingId: string | undefined): Promise<Set<string>> {
    if (!meetingId) return new Set();

    const rows = await this.prisma.meetingAttendance.findMany({
      where: {
        meetingId,
        status: AttendanceStatus.ATTENDING,
        source: AttendanceSource.SELF,
      },
      select: { personId: true },
    });

    return new Set(rows.map((row) => row.personId));
  }
}

/** Die Zusagen von Hand aus einer Liste roher Antworten. */
function selfAttending(
  rows: readonly {
    personId: string;
    status: AttendanceStatus;
    source: AttendanceSource;
  }[],
): Set<string> {
  return new Set(
    rows
      .filter(
        (row) =>
          row.status === AttendanceStatus.ATTENDING &&
          row.source === AttendanceSource.SELF,
      )
      .map((row) => row.personId),
  );
}
