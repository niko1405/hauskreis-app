import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PersonService } from '../person/person.service';
import { PhotoService } from '../person/photo.service';
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
    private readonly photos: PhotoService,
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
    /**
     * Wer den Austritt angestoßen hat.
     *
     * `null` heißt: die Person selbst. Steht hier eine Id, hat eine
     * Admin-Person jemanden entfernt (`PersonService.remove`) — dann stimmt
     * „hat den Hauskreis verlassen" nicht, und die Nachricht darüber geht an
     * alle **außer** die, die es gerade getan hat.
     */
    removedByPersonId: string | null = null,
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
      select: { id: true, name: true, role: true, acceptedAt: true },
    });

    // **Da war** heißt: schon einmal angemeldet. `active` allein reicht nicht,
    // denn dazu zählen auch offene Einladungen und eingesäte Zeilen — Menschen,
    // die diesen Hauskreis noch nie gesehen haben. Wer als Letzter geht, ließe
    // sonst eine Gruppe zurück, deren Verwaltung an jemanden fällt, der sich
    // nie angemeldet hat.
    if (others.every((person) => person.acceptedAt === null)) {
      await this.deleteEmptyHauskreis(hauskreisId, others.length);
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

    // Das Bild danach und außerhalb der Transaktion: eine Datei lässt sich
    // nicht zurückrollen, und ein Austritt darf nicht daran scheitern, dass
    // ein Verzeichnis klemmt. Die Zeile bleibt fürs Archiv stehen, das Gesicht
    // nicht — sie zeigt, wer damals gehostet hat, und dafür reicht der Name.
    await this.photos.remove(personId);

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

    await this.announceDeparture(
      me,
      others.filter((person) => person.id !== removedByPersonId),
      successorPersonId,
      leftover,
      removedByPersonId !== null,
    );

    return { hauskreisDeleted: false, successorPersonId };
  }

  /**
   * Konto löschen — der Austritt plus alles, was danach noch auf die Person
   * zeigt.
   *
   * **Anonymisieren statt löschen.** Die Fremdschlüssel stehen bewusst
   * zweigeteilt: `SetNull` für die Zuschreibung (Gastgeber, Themen-Owner, wer
   * ein Lied eingetragen hat), `Cascade` für die Mitgliedschaft (wer welche
   * Einheit gehalten hat, Anwesenheiten, Actionstep-Haken). Ein `person.delete`
   * nähme **beides** mit — der Abend verlöre seinen Gastgeber *und* die Einheit
   * ihre Gehalten-von-Zeile. Das Archiv wäre danach nicht anonym, sondern
   * löchrig. Die Zeile bleibt also, ohne die Person darin.
   *
   * Der Austritt selbst wird nicht nachgebaut, sondern aufgerufen: Nachfolge,
   * Rollenfreigabe, Gebetsbuddys und die Nachricht an die anderen sind dort
   * schon richtig, und zwei Fassungen davon liefen mit der Zeit auseinander.
   */
  async deleteAccount(
    hauskreisId: string,
    personId: string,
    dto: LeaveHauskreisDto,
  ): Promise<{ hauskreisDeleted: boolean }> {
    // Vor dem Austritt merken: der gibt die Keycloak-Id gleich frei, und danach
    // wüsste niemand mehr, welches Konto gemeint war.
    const before = await this.prisma.person.findFirst({
      where: { id: personId, hauskreisId, active: true },
      select: { keycloakUserId: true, email: true },
    });

    if (!before) {
      throw new NotFoundException('Du gehörst nicht zu diesem Hauskreis');
    }

    const { hauskreisDeleted } = await this.leave(hauskreisId, personId, dto);

    // War es die letzte Person, ist der ganze Hauskreis samt Zeile weg — dann
    // gibt es nichts mehr zu anonymisieren, nur noch das Konto wegzuräumen.
    if (!hauskreisDeleted) {
      await this.prisma.person.update({
        where: { id: personId },
        data: {
          name: 'Ehemaliges Mitglied',
          email: null,
          birthdate: null,
          anonymizedAt: new Date(),
          version: { increment: 1 },
        },
      });

      // Was rein persönlich ist und keinen Archivwert hat. Es hängt an
      // `Cascade`, aber das feuert nur beim Löschen der Zeile — und die bleibt
      // hier gerade stehen.
      await this.prisma.$transaction([
        this.prisma.pushSubscription.deleteMany({ where: { personId } }),
        this.prisma.notificationPreference.deleteMany({ where: { personId } }),
        this.prisma.notificationLog.deleteMany({ where: { personId } }),
        this.prisma.absencePeriod.deleteMany({ where: { personId } }),
      ]);
    }

    // Zuletzt, außerhalb jeder Transaktion — und **ohne** daran zu scheitern.
    //
    // Bis hierher sind Name, Adresse und Geburtstag weg; das ist der Teil, um
    // den es geht, und er ist nicht zurückzunehmen. Läuft Keycloak gerade
    // nicht, wäre ein Fehler jetzt die schlechteste aller Antworten: die
    // Löschung ist passiert, ein zweiter Versuch fände die Zeile nicht mehr,
    // und die Person stünde vor einer Fehlermeldung für etwas, das geklappt
    // hat. Zurück bleibt ein Konto, mit dem sich niemand mehr irgendwo
    // anmelden kann — das räumt ein Mensch weg, kein Neuversuch.
    //
    // Das Nachzählen steckt in `discardInvitationAccount`: wer die App noch in
    // einem anderen Hauskreis benutzt, verliert seinen Zugang nicht.
    try {
      await this.people.discardInvitationAccount(before.email);
    } catch (error) {
      this.logger.error(
        `Konto ${personId} anonymisiert, aber das Keycloak-Konto blieb stehen`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    return { hauskreisDeleted };
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
    /**
     * Ob jemand entfernt wurde, statt selbst zu gehen. Nur der erste Satz
     * ändert sich: „ist nicht mehr dabei" stimmt in beiden Fällen, „hat den
     * Hauskreis verlassen" nur im einen. Wer es getan hat, steht nicht dabei —
     * das ist eine Sache zwischen den beiden und keine Bekanntmachung.
     */
    removed = false,
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
              removed
                ? `${leaver.name} gehört nicht mehr zum Hauskreis.`
                : `${leaver.name} hat den Hauskreis verlassen.`,
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
   * Räumt einen Hauskreis weg, in dem niemand mehr ist.
   *
   * Die Zeilen nimmt der Fremdschlüssel mit (`onDelete: Cascade`). Die
   * Keycloak-Konten offener Einladungen nicht — die räumt sonst
   * `PersonService.remove` weg, wenn eine Einladung zurückgezogen wird, und
   * ohne das hier bliebe je Einladung ein Konto stehen, das sich anmelden kann
   * und nirgends dazugehört.
   */
  private async deleteEmptyHauskreis(
    hauskreisId: string,
    pendingCount: number,
  ): Promise<void> {
    const pending = await this.prisma.person.findMany({
      where: { hauskreisId, acceptedAt: null },
      select: { email: true },
    });

    await this.prisma.hauskreis.delete({ where: { id: hauskreisId } });

    for (const person of pending) {
      await this.people.discardInvitationAccount(person.email);
    }

    this.logger.log(
      `Hauskreis ${hauskreisId} deleted: last member left` +
        (pendingCount > 0
          ? `, ${pendingCount} open invitation(s) dropped`
          : ''),
    );
  }

  /**
   * Wer übernimmt. `null` heißt: es braucht niemanden — entweder ist die
   * gehende Person kein Admin, oder es bleibt noch einer übrig.
   *
   * Der Kreis der Kandidat:innen ist absichtlich **weiter** als die Frage
   * darüber, ob der Hauskreis überhaupt bleibt: wer seine Nachfolge einlädt
   * und dann geht, soll das können, auch wenn sie sich noch nicht angemeldet
   * hat. Nur ganz allein zurücklassen darf man niemanden.
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
    leftover.testimony > 0 && 'jemanden fürs Testimony',
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
