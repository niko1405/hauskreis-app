import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AttendanceSource,
  AttendanceStatus,
} from '../../generated/prisma/enums';
import { GroupClockService } from '../meeting/group-clock.service';
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

    const { count } = await this.prisma.meetingAttendance.createMany({
      data: meetings.flatMap((meeting) =>
        people.map((person) => ({
          meetingId: meeting.id,
          personId: person.id,
          status: AttendanceStatus.ATTENDING,
          source: AttendanceSource.AUTO,
        })),
      ),
      skipDuplicates: true,
    });

    if (count > 0) {
      this.logger.log(
        `Auto-accepted ${count} evening(s) for ${people.length} person/people in Hauskreis ${hauskreisId}`,
      );
    }

    return count;
  }
}
