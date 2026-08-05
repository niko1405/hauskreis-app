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
import { PersonRole } from '../../generated/prisma/enums';
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
      select: { id: true, role: true, locationId: true },
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
          // Die Wohnung gehört nicht mehr in die Rotation dieser Gruppe.
          locationId: null,
        },
      });
    });

    await this.people.syncHomes(me.locationId);

    // Ohne das stünde die gegangene Person in bis zu fünf geplanten Runden —
    // und wer mit ihr gepaart war, bliebe für zwei Wochen allein.
    await this.prayerBuddies.replanAfterMembershipChange(hauskreisId);

    return { hauskreisDeleted: false, successorPersonId };
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
