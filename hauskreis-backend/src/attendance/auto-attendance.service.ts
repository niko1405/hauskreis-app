import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AttendanceSource,
  AttendanceStatus,
} from '../../generated/prisma/enums';
import { GroupClockService } from '../meeting/group-clock.service';
import { touchMeetings } from '../meeting/meeting-version';
import { ANGEKOMMEN } from '../person/angekommen';

/**
 * „Ich bin grundsätzlich dabei."
 *
 * Wer jeden Dienstag kommt, tippte bisher jeden Dienstag dasselbe — und wer es
 * vergaß, stand als „weiß noch nicht" da, was für den Gastgeber beim Einkaufen
 * dasselbe ist wie ein Nein.
 *
 * **Ein Auffüllen, kein Ereignis.** Statt an jeder Stelle, an der ein Termin
 * entsteht, an die Zusagen zu denken, gibt es einen Lauf, der die Lücken
 * schließt: für jede Person mit dem Schalter und jeden kommenden Abend ohne
 * Zeile eine `ATTENDING/AUTO`. Er ist wiederholbar, sagt beim zweiten Mal
 * nichts Neues, und ein verpasster Aufruf heilt beim nächsten.
 *
 * **Nur, wo noch nichts steht.** `skipDuplicates` gegen den zusammengesetzten
 * Schlüssel `(meeting, person)` ist die ganze Regel: eine vorhandene Antwort
 * wird nie überschrieben, egal woher sie kam. Der Schalter füllt Lücken, er
 * überschreibt keine Antworten.
 *
 * **Und nur für Leute, die auch da sind** (`ANGEKOMMEN`). Hier stand `active:
 * true` allein, und das ist genau der stille Fehler, den `angekommen.ts`
 * aufzählt: Eine eingeladene Person ist von der ersten Sekunde an `active` —
 * ihre Zeile entsteht beim Einladen, `autoAttend` kann aus einer Voreinstellung
 * kommen (der Seed setzt es), und wer sich nie angemeldet hat, sagte auf diesem
 * Weg trotzdem jeden Dienstag zu. Auf der Terminkarte stand dann eine Zusage
 * mehr, als die Anwesenheitsliste kannte — die rechnet längst mit `ANGEKOMMEN`,
 * und die beiden Zahlen widersprachen sich.
 *
 * **Wer die Anwesenheit schreibt, schreibt am Termin.** Sie steht mit in seiner
 * Antwort, und ihr ETag hängt allein an `meeting.version`. Ohne den Griff blieb
 * er stehen: Die Terminliste zeigte die frische Zusage (dort ist der ETag ein
 * Inhalts-Hash), die Detailseite antwortete `304` und ließ die Person unter
 * „weiß noch nicht" stehen — mal so, mal so, je nachdem, welcher Bildschirm
 * gerade neu geladen hatte.
 *
 * **Der Status des Abends spielt keine Rolle.** Auch ein abgesagter bekommt
 * seine Zeile: lebt er wieder auf, gilt „ich bin grundsätzlich dabei" auch für
 * ihn, und eine Ausnahme dafür wäre eine Regel mehr, die niemand im Kopf hat.
 */
@Injectable()
export class AutoAttendanceService {
  private readonly logger = new Logger(AutoAttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: GroupClockService,
  ) {}

  /**
   * Schließt die Lücken — für den ganzen Hauskreis oder für eine Person.
   *
   * `personId` gesetzt heißt „gerade eingeschaltet": dann gilt der Schalter
   * **rückwirkend** für alle kommenden Abende, nicht erst ab dem nächsten. Wer
   * ihn umlegt, meint die sieben Dienstage, die er vor sich sieht.
   */
  async apply(
    hauskreisId: string,
    options: { personId?: string; now?: Date } = {},
  ): Promise<number> {
    const today = await this.clock.today(hauskreisId, options.now);

    const [people, meetings] = await Promise.all([
      this.prisma.person.findMany({
        where: {
          ...ANGEKOMMEN,
          hauskreisId,
          autoAttend: true,
          ...(options.personId ? { id: options.personId } : {}),
        },
        select: { id: true },
      }),
      this.prisma.meeting.findMany({
        where: { hauskreisId, date: { gte: today } },
        select: { id: true },
      }),
    ]);

    if (people.length === 0 || meetings.length === 0) {
      return 0;
    }

    // Welche Zeilen wirklich fehlen. `skipDuplicates` allein täte dasselbe,
    // verschluckt aber die Antwort **welche** — und die brauchen wir: jeder
    // angefasste Abend muss eine neue Version bekommen, sonst zeigt seine
    // Detailseite die frische Zusage nicht (`touchMeetings`).
    const vorhanden = await this.prisma.meetingAttendance.findMany({
      where: {
        meetingId: { in: meetings.map((meeting) => meeting.id) },
        personId: { in: people.map((person) => person.id) },
      },
      select: { meetingId: true, personId: true },
    });

    const beantwortet = new Set(
      vorhanden.map((row) => `${row.meetingId}:${row.personId}`),
    );

    const fehlend = meetings.flatMap((meeting) =>
      people
        .filter((person) => !beantwortet.has(`${meeting.id}:${person.id}`))
        .map((person) => ({
          meetingId: meeting.id,
          personId: person.id,
          status: AttendanceStatus.ATTENDING,
          source: AttendanceSource.AUTO,
        })),
    );

    if (fehlend.length === 0) {
      return 0;
    }

    const count = await this.prisma.$transaction(async (tx) => {
      const created = await tx.meetingAttendance.createMany({
        // `skipDuplicates` bleibt trotz der Vorauswahl: zwischen Lesen und
        // Schreiben kann eine Antwort dazwischenkommen, und ein gleichzeitiger
        // zweiter Lauf ist genau der Fall, für den es da ist.
        data: fehlend,
        skipDuplicates: true,
      });

      await touchMeetings(
        tx,
        fehlend.map((row) => row.meetingId),
      );

      return created.count;
    });

    if (count > 0) {
      this.logger.log(
        `Auto-accepted ${count} evening(s) for ${people.length} person/people in Hauskreis ${hauskreisId}`,
      );
    }

    return count;
  }
}
