import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { personRefSelect } from '../common/dto/response';
import { PrismaService } from '../prisma/prisma.service';
import { RoleAssignmentNotifier } from '../notification/role-assignment-notifier.service';
import { RoleAttendanceService } from '../attendance/role-attendance.service';
import { AssignmentRole } from '../../generated/prisma/enums';
import { AvailabilityService } from '../role-suggestion/availability.service';
import { touchMeeting } from './meeting-version';
import type { SetSnackResponsiblesDto } from './dto/meeting.dto';

/**
 * Wer an einem Abend etwas zu essen mitbringt.
 *
 * Der Zwilling von `MeetingSongService.setLeaders`, und bewusst dessen Kopie:
 * Beide verwalten eine Rolle, die mehrere Leute tragen können und die in einer
 * eigenen Tabelle steht. Wo hier etwas anders ist, ist es begründet, und wo
 * nichts steht, gilt dort dasselbe.
 *
 * **Ohne Vorschlagsliste.** Die anderen vier Rollen beantworten „wer wäre als
 * Nächstes dran" mit einer Rangfolge aus Fakten. Bei Snacks stellt diese Frage
 * niemand — wer etwas mitbringt, sagt es, oder man fragt jemanden. Deshalb
 * führt hier eine schlichte Personenauswahl hin und keine `suggest…`-Methode.
 *
 * Als **Last** zählt die Rolle in den anderen vier Listen trotzdem
 * (`collectSnackEvents` in `RoleSuggestionService`): Wer den Kuchen bringt, ist
 * an dem Abend beschäftigt, und ihn ganz oben als Gastgeber vorzuschlagen wäre
 * genau der Fehler, den CLAUDE.md §6.1 einmal behoben hat.
 */
@Injectable()
export class MeetingSnackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roleAssignments: RoleAssignmentNotifier,
    private readonly roleAttendance: RoleAttendanceService,
    private readonly availability: AvailabilityService,
  ) {}

  findResponsibles(hauskreisId: string, meetingId: string) {
    return this.prisma.meetingSnackResponsible
      .findMany({
        where: { meetingId, meeting: { hauskreisId } },
        select: { person: { select: personRefSelect } },
      })
      .then((rows) => rows.map((row) => row.person));
  }

  /**
   * Ersetzt, wer an einem Abend etwas mitbringt.
   *
   * Eine leere Liste ist gültig: Nicht an jedem Abend gibt es etwas zu essen,
   * und selbst wo der Baustein an ist, muss niemand dastehen, bevor es jemand
   * zusagt.
   *
   * Geprüft wird auf **Anwesenheit**, wie bei der Musik: Wer für den Abend
   * abgesagt hat, kann nichts mitbringen. Das ist zugleich der Grund, warum die
   * Auswahl im Frontend Abgesagte gar nicht erst zeigt — ein Knopf, der
   * zuverlässig eine Fehlermeldung erzeugt, ist kein Angebot.
   *
   * Der Baustein wird hier **nicht** geprüft. Er sagt, ob der Abend die Rolle
   * überhaupt vorsieht, und das entscheidet die Oberfläche, bevor sie den Weg
   * hierher anbietet — genauso, wie `setLeaders` nicht nach `hasSongSlot`
   * fragt. Wird er später abgeschaltet, räumt `MeetingService.update` die
   * Zeilen weg.
   */
  async setResponsibles(
    hauskreisId: string,
    meetingId: string,
    dto: SetSnackResponsiblesDto,
    /** Wer gerade einträgt — bekommt keine Nachricht über sich selbst. */
    actorPersonId?: string,
  ) {
    await this.assertMeetingBelongsToHauskreis(hauskreisId, meetingId);
    await this.assertPeopleBelongToHauskreis(hauskreisId, dto.personIds);

    // Vor dem Schreiben: benachrichtigt wird, wer **dazukommt**. Ohne diesen
    // Vergleich hörte beim Nachrücken einer zweiten Person auch die erste noch
    // einmal davon.
    const before = await this.findResponsibles(hauskreisId, meetingId);
    const known = new Set(before.map((person) => person.id));
    const dazu = dto.personIds.filter((personId) => !known.has(personId));

    // Nur die Neuen: Wer schon eingetragen war und inzwischen abgesagt hat,
    // darf nicht dafür sorgen, dass sich die Liste gar nicht mehr ändern lässt.
    await this.availability.assertAvailable(hauskreisId, meetingId, dazu);

    await this.prisma.$transaction(async (tx) => {
      await tx.meetingSnackResponsible.deleteMany({
        where: { meetingId, personId: { notIn: dto.personIds } },
      });

      await tx.meetingSnackResponsible.createMany({
        data: dto.personIds.map((personId) => ({ meetingId, personId })),
        skipDuplicates: true,
      });

      // Die Zuteilung steht mit in der Antwort des Termins, deren ETag an
      // `meeting.version` hängt.
      await touchMeeting(tx, meetingId);
    });

    // Wer etwas mitbringt, kommt auch. Anders als die Nachricht gilt das auch
    // für die Person, die sich selbst einträgt.
    await this.roleAttendance.confirm(meetingId, dazu);

    await this.roleAssignments.announce(
      meetingId,
      AssignmentRole.SNACK,
      dazu,
      actorPersonId,
    );

    return this.findResponsibles(hauskreisId, meetingId);
  }

  private async assertMeetingBelongsToHauskreis(
    hauskreisId: string,
    meetingId: string,
  ): Promise<void> {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id: meetingId, hauskreisId },
      select: { id: true },
    });

    if (!meeting) {
      throw new NotFoundException(`Meeting ${meetingId} not found`);
    }
  }

  private async assertPeopleBelongToHauskreis(
    hauskreisId: string,
    personIds: string[],
  ): Promise<void> {
    if (personIds.length === 0) {
      return;
    }

    const found = await this.prisma.person.count({
      where: { id: { in: personIds }, hauskreisId },
    });

    if (found !== new Set(personIds).size) {
      throw new BadRequestException(
        'At least one person does not belong to this Hauskreis',
      );
    }
  }
}
