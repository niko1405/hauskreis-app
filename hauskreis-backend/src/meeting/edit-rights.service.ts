import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PersonRole } from '../../generated/prisma/enums';
import { mayEdit } from './edit-rights';
import { isPast } from './meeting-schedule';

/**
 * Die Zuständigkeitsregel aus `edit-rights.ts`, angewandt auf die Liedauswahl
 * eines Abends.
 *
 * Zwei weitere Anwendungen standen einmal hier — Themenname und Nachbereitung.
 * Beide sind ans Thema gewandert (`topic-visibility.ts`), weil sie inzwischen
 * einer anderen Frage folgen: nicht „wer ist an diesem Abend zugeteilt", sondern
 * „wer gehört zu diesem Thema". Ein Thema zieht sich über mehrere Abende, sein
 * Bearbeitungsrecht deshalb auch.
 *
 * Eigener Dienst in einem Modul ohne Importe. `PrismaModule` ist `@Global`,
 * dieses Modul importiert deshalb nichts — so ist der Zyklus ausgeschlossen, den
 * der Modulgraph hier schon einmal hatte.
 */
@Injectable()
export class EditRightsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lieder abhaken: die Musik-Zuständigen — **vor** dem Abend.
   *
   * Danach darf jede:r. Vorher ist das Abhaken eine Entscheidung („das singen
   * wir"), und die trifft, wer die Musik macht. Hinterher ist es ein Protokoll
   * („das haben wir gesungen"), und daran erinnert sich jede:r gleich gut. Wer
   * am nächsten Tag nachträgt, was tatsächlich dran war, tut der Liederdatenbank
   * einen Gefallen und niemandem etwas zuleide.
   */
  async assertMayPickSongs(meetingId: string, personId: string): Promise<void> {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        date: true,
        songLeaders: { select: { personId: true } },
      },
    });

    if (meeting && isPast(meeting.date)) return;

    await this.assert(
      personId,
      (meeting?.songLeaders ?? []).map((row) => row.personId),
      'Die Liedauswahl trifft, wer an dem Abend die Musik macht.',
    );
  }

  private async assert(
    personId: string,
    responsibles: string[],
    message: string,
  ): Promise<void> {
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { role: true },
    });

    const allowed = mayEdit({
      isAdmin: person?.role === PersonRole.ADMIN,
      personId,
      responsibles,
    });

    if (!allowed) throw new ForbiddenException(message);
  }
}
