import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PersonService } from '../person/person.service';
import { PrayerBuddyGeneratorService } from '../prayer-buddy/prayer-buddy-generator.service';
import {
  RoleReleaseService,
  type LeftoverRoles,
} from '../meeting/role-release.service';
import { MeetingCancellationService } from '../meeting/meeting-cancellation.service';
import { NotificationService } from '../notification/notification.service';
import { appPath } from '../notification/app-paths';
import { NotificationType, PersonRole } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../auth/auth.types';
import type {
  CreateHauskreisDto,
  LeaveHauskreisDto,
} from './dto/hauskreis.dto';

/**
 * Beitreten, gründen, verlassen — alles, was die **Zugehörigkeit** eines
 * Menschen zu einem Hauskreis ändert.
 *
 * Die Regel dahinter ist eine einzige: **ein Mensch, ein Hauskreis.** Ein
 * Wechsel ist deshalb ein Umzug und kein Nebeneinander — erst gehen, dann
 * ankommen. Das hält `Person.keycloakUserId @unique` als Regel aufrecht statt
 * als Hindernis und erspart es, Name, Geburtstag und Wohnung je Mitgliedschaft
 * doppelt zu pflegen.
 */
@Injectable()
export class MembershipService {
  private readonly logger = new Logger(MembershipService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly people: PersonService,
    private readonly prayerBuddies: PrayerBuddyGeneratorService,
    private readonly roleRelease: RoleReleaseService,
    private readonly cancellations: MeetingCancellationService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Gründet einen Hauskreis und macht die gründende Person zum Admin.
   *
   * Vorher legte `POST /api/hauskreise` eine leere Gruppe an, die niemand
   * betreten konnte — kein Mensch drin, also auch niemand, der einladen durfte.
   */
  async create(user: AuthenticatedUser, dto: CreateHauskreisDto) {
    const existing = await this.prisma.person.findUnique({
      where: { keycloakUserId: user.keycloakUserId },
      select: { active: true, hauskreis: { select: { name: true } } },
    });

    if (existing?.active) {
      throw new ConflictException(
        `Du bist noch bei „${existing.hauskreis.name}" dabei. Verlasse den Hauskreis zuerst.`,
      );
    }

    if (!user.email) {
      throw new BadRequestException(
        'Ohne E-Mail-Adresse im Konto lässt sich kein Hauskreis anlegen',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const hauskreis = await tx.hauskreis.create({ data: { name: dto.name } });

      await tx.person.create({
        data: {
          hauskreisId: hauskreis.id,
          keycloakUserId: user.keycloakUserId,
          name: user.name ?? user.email!,
          email: user.email!,
          role: PersonRole.ADMIN,
          acceptedAt: new Date(),
        },
      });

      return hauskreis;
    });
  }

  /**
   * Verlässt den Hauskreis.
   *
   * Die Zeile bleibt stehen (`active = false`), damit vergangene Abende weiter
   * zeigen, wer gehostet hat — nur die `keycloakUserId` wird frei, sonst käme
   * man nirgends mehr an.
   *
   * Wer als **einzige Admin-Person** geht, muss eine Nachfolge benennen. Das
   * zu verbieten wäre die bequemere Lösung und eine Sackgasse: dann säße jemand
   * für immer in einem Hauskreis fest, den er verlassen will. Ist er die letzte
   * Person überhaupt, wird der Hauskreis mit gelöscht — eine leere Gruppe, die
   * niemand betreten kann, ist kein sinnvoller Zustand.
   */
  async leave(
    hauskreisId: string,
    personId: string,
    dto: LeaveHauskreisDto,
  ): Promise<{ hauskreisDeleted: boolean; successorPersonId: string | null }> {
    const me = await this.prisma.person.findFirst({
      where: { id: personId, hauskreisId, active: true },
      select: { id: true, name: true, role: true, locationId: true },
    });

    if (!me) {
      throw new NotFoundException('Du gehörst nicht zu diesem Hauskreis');
    }

    const others = await this.prisma.person.findMany({
      where: { hauskreisId, active: true, id: { not: personId } },
      select: { id: true, name: true, role: true },
    });

    if (others.length === 0) {
      await this.prisma.hauskreis.delete({ where: { id: hauskreisId } });
      this.logger.log(`Hauskreis ${hauskreisId} deleted: last member left`);
      return { hauskreisDeleted: true, successorPersonId: null };
    }

    const successorPersonId = this.chooseSuccessor(me.role, others, dto);

    await this.prisma.$transaction(async (tx) => {
      if (successorPersonId) {
        await tx.person.update({
          where: { id: successorPersonId },
          data: { role: PersonRole.ADMIN },
        });
      }

      await tx.person.update({
        where: { id: personId },
        data: {
          active: false,
          keycloakUserId: null,
          // Wie die Keycloak-Id: das Konto behält seinen Namen, die Zeile hält
          // ihn nicht länger besetzt. `username` ist global eindeutig — bliebe
          // er stehen, könnte derselbe Mensch in einem anderen Hauskreis nicht
          // mehr unter seinem Namen ankommen.
          username: null,
          // Die Wohnung gehört nicht mehr in die Rotation dieser Gruppe.
          locationId: null,
        },
      });
    });

    await this.people.syncHomes(me.locationId);

    // Erst freiräumen, dann neu bewerten: `reconcile` zählt Absagen gegen die
    // Zahl der aktiven Menschen, und beides hat sich gerade geändert.
    const leftover = await this.roleRelease.releaseEverythingUpcoming(
      hauskreisId,
      personId,
    );

    for (const meetingId of leftover.meetingIds) {
      await this.cancellations.reconcile(meetingId);
    }

    // Ohne das stünde die gegangene Person in bis zu fünf geplanten Runden —
    // und wer mit ihr gepaart war, bliebe für zwei Wochen allein.
    await this.prayerBuddies.replanAfterMembershipChange(hauskreisId);

    await this.announceDeparture(me, others, successorPersonId, leftover);

    return { hauskreisDeleted: false, successorPersonId };
  }

  /**
   * Sagt den Verbleibenden Bescheid.
   *
   * Bis hierher passierte ein Austritt lautlos: `active` fiel auf `false`, und
   * die anderen acht merkten es daran, dass jemand nicht mehr auftauchte. In
   * einer Gruppe von neun Leuten ist das genau die Nachricht, die man nicht aus
   * einer Tabelle ablesen will.
   *
   * Was dadurch **offen** bleibt, steht mit drin. Ein Abend ohne Gastgeber ist
   * die eigentliche Folge des Austritts, und wer sie erst beim Durchblättern des
   * Plans entdeckt, entdeckt sie zu spät.
   *
   * Die Nachfolge bekommt denselben Text mit einem Satz mehr. Ein eigener
   * Schalter dafür wäre ein zehnter Eintrag in den Einstellungen für einen Fall,
   * den man ein- oder zweimal im Jahr erlebt.
   */
  private async announceDeparture(
    leaver: { id: string; name: string },
    others: { id: string }[],
    successorPersonId: string | null,
    leftover: LeftoverRoles,
  ): Promise<void> {
    const open = describeOpenRoles(leftover);

    await Promise.all(
      others.map((person) =>
        this.notifications.notify({
          personId: person.id,
          type: NotificationType.MEMBER_LEFT,
          // Die Person, um die es geht — nicht die Empfängerin. Ohne das hielte
          // `hasBeenSent` den zweiten Austritt für eine Dublette des ersten.
          relatedPersonId: leaver.id,
          payload: {
            title: `${leaver.name} ist nicht mehr dabei`,
            body: [
              `${leaver.name} hat den Hauskreis verlassen.`,
              open,
              person.id === successorPersonId
                ? 'Du übernimmst ab jetzt die Verwaltung.'
                : undefined,
            ]
              .filter(Boolean)
              .join(' '),
            url: appPath.meetings(),
          },
        }),
      ),
    );
  }

  /**
   * Wer übernimmt. `null` heißt: es braucht niemanden — entweder ist die
   * gehende Person kein Admin, oder es bleibt noch einer übrig.
   */
  private chooseSuccessor(
    myRole: PersonRole,
    others: { id: string; name: string; role: PersonRole }[],
    dto: LeaveHauskreisDto,
  ): string | null {
    const someoneElseIsAdmin = others.some(
      (person) => person.role === PersonRole.ADMIN,
    );

    if (myRole !== PersonRole.ADMIN || someoneElseIsAdmin) {
      return null;
    }

    if (!dto.successorPersonId) {
      throw new BadRequestException(
        'Du bist die einzige Person mit Admin-Rechten. Bestimme jemanden, der übernimmt.',
      );
    }

    const successor = others.find(
      (person) => person.id === dto.successorPersonId,
    );

    if (!successor) {
      throw new BadRequestException(
        'Die gewählte Nachfolge gehört nicht zu diesem Hauskreis',
      );
    }

    return successor.id;
  }

  /**
   * Offene Einladungen: Zeilen mit der eigenen Adresse, die noch niemandem
   * gehören. Sie entstehen beim Einladen und nehmen der bestehenden
   * Mitgliedschaft nichts weg — bis man sie annimmt.
   */
  async invitations(user: AuthenticatedUser) {
    if (!user.email) return [];

    const rows = await this.prisma.person.findMany({
      where: { email: user.email, keycloakUserId: null, active: true },
      select: {
        id: true,
        role: true,
        createdAt: true,
        hauskreis: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map((row) => ({
      personId: row.id,
      role: row.role,
      invitedAt: row.createdAt,
      hauskreis: row.hauskreis,
    }));
  }

  /**
   * Nimmt eine Einladung an — und verlässt dabei den bisherigen Hauskreis.
   *
   * Ausdrücklich ein eigener Schritt und kein Nebeneffekt des Anmeldens: dass
   * eine Einladung die bestehende Mitgliedschaft beendet, ist genau die
   * Überraschung, vor der man gefragt werden will.
   *
   * Die Gebetsbuddys werden hier **nicht** neu geplant, und das ist kein
   * Versehen: die Zeile ist seit der Einladung `active`, in der Rotation steht
   * die Person also längst. Was sich ändert, ist der *alte* Hauskreis — darum
   * kümmert sich `leave`.
   */
  async acceptInvitation(
    user: AuthenticatedUser,
    invitationPersonId: string,
    dto: LeaveHauskreisDto,
  ) {
    const invitation = await this.prisma.person.findFirst({
      where: {
        id: invitationPersonId,
        email: user.email,
        keycloakUserId: null,
        active: true,
      },
      select: { id: true, hauskreisId: true },
    });

    if (!invitation) {
      throw new NotFoundException('Diese Einladung gibt es nicht (mehr)');
    }

    const current = await this.prisma.person.findUnique({
      where: { keycloakUserId: user.keycloakUserId },
      select: { id: true, hauskreisId: true, active: true },
    });

    // Zuerst gehen, dann ankommen: `keycloakUserId` ist global eindeutig, die
    // Reihenfolge ist also keine Geschmacksfrage.
    if (current?.active) {
      await this.leave(current.hauskreisId, current.id, dto);
    }

    return this.prisma.person.update({
      where: { id: invitation.id },
      data: { keycloakUserId: user.keycloakUserId, acceptedAt: new Date() },
    });
  }
}

/**
 * „Ein Abend braucht jetzt einen neuen Gastgeber." — oder gar nichts, wenn
 * nichts offen blieb.
 *
 * Genannt wird, **was** offen ist, nicht wie viel. „Drei Abende brauchen einen
 * Gastgeber" liest sich wie eine Rechnung; für die Zahl gibt es die
 * Planungstabelle, und die ist einen Tipp entfernt.
 */
function describeOpenRoles(leftover: LeftoverRoles): string | undefined {
  const open = [
    leftover.host > 0 && 'einen Gastgeber',
    leftover.song > 0 && 'jemanden für die Musik',
    leftover.topic > 0 && 'jemanden fürs Thema',
  ].filter((entry): entry is string => typeof entry === 'string');

  if (open.length === 0) {
    return undefined;
  }

  const list =
    open.length === 1
      ? open[0]
      : `${open.slice(0, -1).join(', ')} und ${open[open.length - 1]}`;

  return `Der Plan braucht jetzt ${list}.`;
}
