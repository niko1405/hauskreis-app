import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PersonRole } from '../../generated/prisma/enums';
import { mayEdit } from './edit-rights';
import { isPast } from './meeting-schedule';

/**
 * Die Zuständigkeitsregel aus `edit-rights.ts`, angewandt auf die zwei Stellen,
 * an denen sie gilt: der Inhalt eines Themas und die Liedauswahl eines Abends.
 *
 * Eigener Dienst in einem Modul ohne Importe, weil ihn drei Module brauchen —
 * `MeetingModule`, `TopicModule` und `SongModule`. Läge er in einem davon,
 * hätten die anderen beiden eine Kante dorthin, und der Modulgraph hat schon
 * einmal genau daran einen Zyklus bekommen. `PrismaModule` ist `@Global`,
 * dieses Modul importiert deshalb nichts.
 */
@Injectable()
export class EditRightsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Themenname: die Zuständigen des Themas selbst.
   *
   * Ohne Abend, anders als unten — `TopicResponsible` hängt am Thema und nicht
   * am Termin, und ein Thema kann sich über mehrere Abende ziehen. Wer es
   * vorbereitet, benennt es.
   */
  async assertMayEditTopic(topicId: string, personId: string): Promise<void> {
    const responsibles = await this.prisma.topicResponsible.findMany({
      where: { topicId },
      select: { personId: true },
    });

    await this.assert(
      personId,
      responsibles.map((row) => row.personId),
      'Das Thema benennt, wer es vorbereitet.',
    );
  }

  /**
   * Zusammenfassung und Actionstep: die Zuständigen des Themas **dieses**
   * Abends.
   *
   * Hat der Abend gar kein Thema, gibt es auch nichts nachzubereiten — das
   * lehnt aber schon der Baustein ab (`assertSlotsAllow`), bevor es hierher
   * kommt. Ein Abend mit Thema, aber ohne Zuständige, fällt in den dritten
   * Fall der Regel: dann darf jede:r.
   */
  async assertMayWriteSummary(
    meetingId: string,
    personId: string,
  ): Promise<void> {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        topic: { select: { responsibles: { select: { personId: true } } } },
      },
    });

    await this.assert(
      personId,
      (meeting?.topic?.responsibles ?? []).map((row) => row.personId),
      'Zusammenfassung und Actionstep trägt ein, wer das Thema vorbereitet.',
    );
  }

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
