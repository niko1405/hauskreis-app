import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { personRefSelect } from '../common/dto/response';
import { PrismaService } from '../prisma/prisma.service';
import { GroupClockService } from '../meeting/group-clock.service';
import { MeetingStatus } from '../../generated/prisma/enums';
import type { UpsertPrayerRequestDto } from './dto/prayer-request.dto';

const prayerRequestSelect = {
  text: true,
  updatedAt: true,
  person: { select: personRefSelect },
} as const;

/**
 * Die Gebetsanliegen eines Abends — eines je Person.
 *
 * **Lesen alle, schreiben nur die eigene.** Das ist keine Rechteprüfung im
 * üblichen Sinn, sondern eine Eigenschaft der Routen: Sie heißen `…/mine` und
 * tragen keine Personen-Id. Die Person kommt aus dem Token, jeder Aufrufer
 * schreibt also zwangsläufig an seiner eigenen Zeile. Ein Admin-Freifahrtschein
 * kann hier nicht einmal versehentlich entstehen.
 *
 * **Anlegen darf jede:r, auch wer an dem Abend fehlt.** Wer nicht kommt, hat
 * nicht weniger Anliegen — die Bitte, dass die anderen für ihn beten, ist dann
 * eher wichtiger. Deshalb steht hier keine Anwesenheitsprüfung, anders als bei
 * den Rollen.
 */
@Injectable()
export class PrayerRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: GroupClockService,
  ) {}

  findAll(hauskreisId: string, meetingId: string) {
    return this.prisma.meetingPrayerRequest.findMany({
      where: { meetingId, meeting: { hauskreisId } },
      select: prayerRequestSelect,
      // Wer zuerst etwas geschrieben hat, steht oben — die Reihenfolge, in der
      // die Anliegen entstanden sind, ist die einzige, die niemanden bewertet.
      orderBy: { createdAt: 'asc' },
    });
  }

  async upsertMine(
    hauskreisId: string,
    meetingId: string,
    dto: UpsertPrayerRequestDto,
    personId: string,
  ) {
    await this.assertStillOpen(hauskreisId, meetingId);

    return this.prisma.meetingPrayerRequest.upsert({
      where: { meetingId_personId: { meetingId, personId } },
      create: { meetingId, personId, text: dto.text },
      update: { text: dto.text },
      select: prayerRequestSelect,
    });
  }

  async removeMine(hauskreisId: string, meetingId: string, personId: string) {
    await this.assertStillOpen(hauskreisId, meetingId);

    // `deleteMany` statt `delete`: Wer zweimal auf den Papierkorb tippt, hat
    // nichts falsch gemacht, und ein `P2025` wäre dafür eine seltsame Antwort.
    await this.prisma.meetingPrayerRequest.deleteMany({
      where: { meetingId, personId },
    });
  }

  /**
   * Prüft die Mandantengrenze **und** ob der Abend noch offen ist.
   *
   * Beides in einer Abfrage, weil beides denselben Termin braucht.
   *
   * Nach dem Abend steht noch da, was war, aber niemand ändert mehr etwas — wie
   * bei den Liedern, die danach „Gesungen" heißen. Ein Gebetsanliegen für einen
   * Abend, der vorbei ist, nachträglich umzuschreiben, hieße die Geschichte zu
   * ändern; es zu löschen wäre das Aufräumen von etwas, für das andere gebetet
   * haben. Ein abgesagter Abend hat aus demselben Grund nichts mehr zu sammeln.
   */
  private async assertStillOpen(
    hauskreisId: string,
    meetingId: string,
  ): Promise<void> {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id: meetingId, hauskreisId },
      select: { date: true, status: true },
    });

    if (!meeting) {
      throw new NotFoundException(`Meeting ${meetingId} not found`);
    }

    if (meeting.status === MeetingStatus.CANCELLED) {
      throw new BadRequestException(
        'Dieser Abend fällt aus — Gebetsanliegen lassen sich dafür nicht mehr eintragen.',
      );
    }

    if (await this.clock.isPast(hauskreisId, meeting.date)) {
      throw new BadRequestException(
        'Dieser Abend ist vorbei — was dasteht, bleibt stehen.',
      );
    }
  }
}
