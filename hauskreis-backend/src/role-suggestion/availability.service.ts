import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceStatus } from '../../generated/prisma/enums';
import { AbsenceCalendar } from '../absence/absence-window';

/**
 * Wer an einem Abend da ist — und wer deshalb eine Rolle übernehmen kann.
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
 */
@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

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
    if (isPastDay(date)) return [];

    const [declined, periods, people] = await Promise.all([
      this.prisma.meetingAttendance.findMany({
        where: {
          meetingId,
          personId: { in: [...personIds] },
          status: AttendanceStatus.ABSENT,
        },
        select: { personId: true },
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

    const calendar = new AbsenceCalendar(periods);
    const declinedIds = new Set(declined.map((row) => row.personId));

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
}

function isPastDay(date: Date): boolean {
  const now = new Date();
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );

  return (
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) <
    today
  );
}
