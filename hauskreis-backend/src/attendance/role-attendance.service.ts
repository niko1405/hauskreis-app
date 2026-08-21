import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AttendanceSource,
  AttendanceStatus,
  MeetingStatus,
} from '../../generated/prisma/enums';
import { GroupClockService } from '../meeting/group-clock.service';
import { touchMeeting } from '../meeting/meeting-version';

/**
 * „Wer eingeteilt ist, ist dabei."
 *
 * Eine Rolle zu bekommen und daneben auf „weiß noch nicht" zu stehen ist kein
 * Zustand, den jemand gemeint hat — und für den Gastgeber beim Einkaufen ist
 * ein „weiß noch nicht" dasselbe wie ein Nein. Wer das Thema vorbereitet, die
 * Lieder übt, sein Testimony erzählt oder die Tür aufmacht, kommt.
 *
 * **Nur aus dem Schweigen heraus.** Angefasst wird ausschließlich, wer noch gar
 * nicht geantwortet hat oder auf `UNKNOWN` steht. Ein `ABSENT` bleibt stehen:
 * Es *gibt* den Fall, dass jemand eingetragen wird, obwohl er abgesagt hat —
 * beim Thema wird die Crew auf die Abend-Rolle übertragen, und wer an dem Abend
 * fehlt, wird dort übersprungen statt abgelehnt. Eine Absage in eine Zusage zu
 * drehen wäre eine Antwort, die niemand gegeben hat. Ein bestehendes
 * `ATTENDING` bleibt ebenfalls, wie es ist, samt seiner Quelle.
 *
 * **Nur nach vorn und nur für Abende, die stattfinden.** Wer nachträgt, wer im
 * Mai das Thema hatte, schreibt Protokoll und ändert nicht, wer da war; und ein
 * abgesagter Abend hat keine Anwesenheit, die eine Zuteilung bestätigen könnte.
 * Dieselben zwei Regeln hat `RoleAssignmentNotifier` — aus demselben Grund.
 *
 * **Der Weg zurück ist keiner.** Wer aus einer Rolle fällt, behält seine
 * Zusage. Sie stillschweigend zurückzunehmen wäre eine Absage, die niemand
 * ausgesprochen hat — dasselbe Argument, mit dem auch der ausgeschaltete
 * Schalter „ich bin grundsätzlich dabei" die schon geschriebenen Zusagen stehen
 * lässt.
 */
@Injectable()
export class RoleAttendanceService {
  private readonly logger = new Logger(RoleAttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: GroupClockService,
  ) {}

  /**
   * Setzt die Zugeteilten auf „dabei", soweit sie noch nichts gesagt haben.
   *
   * Antwortet mit der Zahl der geänderten Antworten — die Aufrufer hängen daran
   * die Frage, ob sie den Termin neu laden müssen: Die Anwesenheit steht mit in
   * seiner Antwort, und die Version ist gerade gesprungen.
   */
  async confirm(
    meetingId: string,
    personIds: readonly string[],
  ): Promise<number> {
    if (personIds.length === 0) return 0;

    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      // Die Zone der Gruppe entscheidet, ob dieser Abend vorbei ist — nicht die
      // des Servers.
      select: { hauskreisId: true, date: true, status: true },
    });

    if (!meeting || meeting.status === MeetingStatus.CANCELLED) return 0;
    if (await this.clock.isPast(meeting.hauskreisId, meeting.date)) return 0;

    const ids = [...new Set(personIds)];

    const vorhanden = await this.prisma.meetingAttendance.findMany({
      where: { meetingId, personId: { in: ids } },
      select: { personId: true, status: true },
    });

    const beantwortet = new Map(
      vorhanden.map((row) => [row.personId, row.status]),
    );

    const offen = ids.filter(
      (personId) =>
        (beantwortet.get(personId) ?? AttendanceStatus.UNKNOWN) ===
        AttendanceStatus.UNKNOWN,
    );

    if (offen.length === 0) return 0;

    const neu = offen.filter((personId) => !beantwortet.has(personId));

    await this.prisma.$transaction(async (tx) => {
      // Die Bedingung `status: UNKNOWN` steht noch einmal im `where`, obwohl
      // `offen` sie schon erfüllt: Zwischen Lesen und Schreiben kann jemand
      // absagen, und dann darf diese Zeile ihn nicht überschreiben.
      await tx.meetingAttendance.updateMany({
        where: {
          meetingId,
          personId: { in: offen },
          status: AttendanceStatus.UNKNOWN,
        },
        data: {
          status: AttendanceStatus.ATTENDING,
          source: AttendanceSource.ROLE,
        },
      });

      if (neu.length > 0) {
        await tx.meetingAttendance.createMany({
          data: neu.map((personId) => ({
            meetingId,
            personId,
            status: AttendanceStatus.ATTENDING,
            source: AttendanceSource.ROLE,
          })),
          skipDuplicates: true,
        });
      }

      // Die Anwesenheit steht mit in der Antwort des Termins.
      await touchMeeting(tx, meetingId);
    });

    this.logger.log(
      `Role assignment accepted ${offen.length} evening(s) on meeting ${meetingId}`,
    );

    return offen.length;
  }
}
