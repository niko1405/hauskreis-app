import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GroupClockService } from './group-clock.service';

/**
 * Wer die Liedauswahl eines Abends trifft.
 *
 * Die Regel ist zweigeteilt, und der Bruch liegt am Abend selbst:
 *
 * ```
 * vor dem Abend  → nur, wer an dem Abend die Musik macht
 * nach dem Abend → jede:r
 * ```
 *
 * Vorher ist das Abhaken eine **Entscheidung** („das singen wir"), und die
 * trifft, wer die Musik macht — sie muss die Lieder üben, nicht die Gruppe.
 * Hinterher ist es ein **Protokoll** („das haben wir gesungen"), und daran
 * erinnert sich jede:r gleich gut. Wer am nächsten Tag nachträgt, was tatsächlich
 * dran war, tut der Liederdatenbank einen Gefallen und niemandem etwas zuleide.
 *
 * **Zwei Ausnahmen sind bewusst weg.** Eine mildere Fassung ließ Admins immer
 * und alle, solange niemand zugeteilt war. Beides passt hier nicht: Musik machen
 * ist keine Verwaltungsaufgabe, die ein Admin für andere erledigt, und ein Abend
 * ohne Musik-Zuteilung ist kein Abend, an dem jede:r bestimmen darf, sondern
 * einer, an dem noch niemand zugeteilt ist. Wer die Auswahl treffen will, trägt
 * sich als zuständig ein — das ist eine Zeile und kein Hindernis. Dieselbe
 * strenge Fassung gilt beim Wählen eines Themas (`TopicSessionService.choose`).
 *
 * **„Nach dem Abend" heißt: am nächsten Tag der Gruppe.** Der Vergleich lief
 * einmal über den UTC-Kalendertag, und damit galt zwischen Mitternacht und zwei
 * Uhr morgens der gestrige Abend noch als kommend — während die App ihn schon
 * mit „Vorbei" auswies und die Kästchen freigab. Der 403 kam dann aus dieser
 * Zeile. Maßgeblich ist jetzt der Tag in der Zone der Gruppe.
 *
 * Eigener Dienst in einem Modul ohne Importe. `PrismaModule` und `ClockModule`
 * sind `@Global`, dieses Modul importiert deshalb nichts — so ist der Zyklus
 * ausgeschlossen, den der Modulgraph hier schon einmal hatte.
 */
@Injectable()
export class EditRightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: GroupClockService,
  ) {}

  async assertMayPickSongs(meetingId: string, personId: string): Promise<void> {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        // Nur für die Zone der Gruppe geladen — die Rechteprüfung selbst
        // bekommt die Zugehörigkeit vom Aufrufer bestätigt.
        hauskreisId: true,
        date: true,
        songLeaders: { select: { personId: true } },
      },
    });

    if (meeting && (await this.clock.isPast(meeting.hauskreisId, meeting.date)))
      return;

    const leaders = (meeting?.songLeaders ?? []).map((row) => row.personId);

    if (!leaders.includes(personId)) {
      throw new ForbiddenException(
        'Die Liedauswahl trifft, wer an dem Abend die Musik macht — trag dich erst als zuständig ein.',
      );
    }
  }
}
