import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { PersonRole } from '../../generated/prisma/enums';
import { GroupClockService } from '../meeting/group-clock.service';
import { KeycloakAdminService } from '../auth/keycloak-admin.service';
import { LocationService } from '../location/location.service';
import { AutoAttendanceService } from '../attendance/auto-attendance.service';
import { PrayerBuddyGeneratorService } from '../prayer-buddy/prayer-buddy-generator.service';
import { MEMBERSHIP_SERVICE } from '../hauskreis/membership.token';
import type { MembershipService } from '../hauskreis/membership.service';
import type {
  AuthenticatedUser,
  HauskreisMembership,
} from '../auth/auth.types';
import { updateWithVersionCheck } from '../common/http/optimistic-update';
import type { IfMatchCondition } from '../common/http/etag';
import type {
  CreatePersonDto,
  InvitePersonDto,
  UpdatePersonDto,
} from './dto/person.dto';

/**
 * What a person looks like to the rest of the group.
 *
 * `keycloakUserId` is deliberately absent: it is the internal link to the
 * identity provider, of no use to any client and not something to hand around.
 * `email` stays — an admin managing members needs it, and in a group of nine
 * everyone knows it anyway.
 */
const personSelect = {
  id: true,
  hauskreisId: true,
  name: true,
  username: true,
  email: true,
  role: true,
  birthdate: true,
  playsInstrument: true,
  canHost: true,
  autoAttend: true,
  photoUpdatedAt: true,
  locationId: true,
  active: true,
  acceptedAt: true,
  createdAt: true,
  version: true,
} as const;

@Injectable()
export class PersonService {
  private readonly logger = new Logger(PersonService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly keycloakAdmin: KeycloakAdminService,
    private readonly locations: LocationService,
    private readonly autoAttendance: AutoAttendanceService,
    private readonly moduleRef: ModuleRef,
    private readonly clock: GroupClockService,
  ) {}

  /**
   * Zieht die Gebetsrotation nach, nachdem sich die Menge der aktiven Menschen
   * geändert hat.
   *
   * Nachgeschlagen statt hineingereicht, und dafür gibt es einen Grund:
   * `NotificationModule` braucht `PersonModule`, `PrayerBuddyModule` braucht
   * `NotificationModule`. Importierte `PersonModule` seinerseits
   * `PrayerBuddyModule`, stünde der Kreis, und Nest käme beim Hochfahren nicht
   * mehr durch (`UndefinedModuleException`).
   *
   * `forwardRef` an beiden Kanten wäre die andere Antwort. Sie verteilt die
   * Erklärung aber auf drei Dateien, von denen eine — Benachrichtigungen — mit
   * Gebetsbuddys nichts zu tun hat und den nächsten Leser ratlos zurückließe.
   * Hier steht die Begründung an der Stelle, an der auch das Verhalten steht.
   *
   * Es ist ohnehin keine Zusammenarbeit, sondern eine Folge: hier ändert sich
   * die Gruppe, und wen das angeht, der zieht nach.
   */
  private async replanPrayerBuddies(hauskreisId: string): Promise<void> {
    const generator = this.moduleRef.get(PrayerBuddyGeneratorService, {
      strict: false,
    });

    await generator.replanAfterMembershipChange(hauskreisId);
  }

  /**
   * Zieht die Namen der betroffenen Wohnungen nach, nachdem jemand um- oder
   * ausgezogen ist.
   *
   * Beide Seiten, nicht nur die neue: die alte Wohnung heißt sonst weiter
   * „Bei Niko & Chris", obwohl Chris längst woanders wohnt — und bleibt mit
   * ihrem Gewicht in der Host-Rotation, obwohl niemand mehr dort einladen kann.
   */
  /**
   * Zieht die Namen der betroffenen Wohnungen nach („Bei Niko & Chris" wird
   * wieder „Bei Chris"). Öffentlich, weil auch das Verlassen eines Hauskreises
   * eine Wohnung freigibt.
   */
  async syncHomes(...locationIds: (string | null | undefined)[]) {
    const affected = new Set(
      locationIds.filter((id): id is string => typeof id === 'string'),
    );

    // Verschiedene Wohnungen, keine gemeinsamen Zeilen — nacheinander gäbe es
    // nichts zu gewinnen.
    await Promise.all(
      [...affected].map((locationId) =>
        this.locations.syncHomeName(locationId),
      ),
    );
  }

  /**
   * Alle Personen des Hauskreises, mit `awayToday` dazu.
   *
   * Abgeleitet und nicht gespeichert: „ist gerade weg" ist eine Frage an den
   * Kalender, keine Eigenschaft eines Menschen. Serverseitig, weil das Frontend
   * sonst eine zweite Liste holen und beide verschneiden müsste — eine Abfrage
   * hier ist billiger als eine Runde mehr über die Leitung, und die Antwort
   * wäre dieselbe.
   */
  async findAll(hauskreisId: string) {
    const today = await this.clock.today(hauskreisId);

    const [people, away] = await Promise.all([
      this.prisma.person.findMany({
        where: { hauskreisId },
        select: personSelect,
        orderBy: { name: 'asc' },
      }),
      this.prisma.absencePeriod.findMany({
        where: {
          hauskreisId,
          startDate: { lte: today },
          endDate: { gte: today },
        },
        select: { personId: true },
      }),
    ]);

    const awayIds = new Set(away.map((period) => period.personId));

    return people.map((person) => ({
      ...person,
      awayToday: awayIds.has(person.id),
    }));
  }

  async findOne(hauskreisId: string, id: string) {
    const person = await this.prisma.person.findFirst({
      where: { id, hauskreisId },
      select: personSelect,
    });

    if (!person) {
      throw new NotFoundException(`Person ${id} not found`);
    }

    return person;
  }

  async create(hauskreisId: string, dto: CreatePersonDto) {
    await this.assertLocationBelongsToHauskreis(hauskreisId, dto.locationId);

    const person = await this.prisma.person.create({
      data: {
        hauskreisId,
        name: dto.name,
        email: dto.email,
        birthdate: dto.birthdate ? new Date(dto.birthdate) : null,
        playsInstrument: dto.playsInstrument,
        canHost: dto.canHost,
        autoAttend: dto.autoAttend,
        locationId: dto.locationId ?? null,
      },
    });

    await this.syncHomes(person.locationId);
    await this.replanPrayerBuddies(hauskreisId);

    if (person.autoAttend) {
      await this.autoAttendance.apply(hauskreisId, { personId: person.id });
    }

    return person;
  }

  async update(
    hauskreisId: string,
    id: string,
    dto: UpdatePersonDto,
    /** Wer gerade ändert. Entscheidet, ob `role` gesetzt werden darf. */
    actor?: HauskreisMembership,
    condition?: IfMatchCondition,
  ) {
    await this.assertLocationBelongsToHauskreis(hauskreisId, dto.locationId);
    await this.assertMayChangeRole(hauskreisId, id, dto.role, actor);

    // Vor dem Schreiben, sonst ist nicht mehr feststellbar, wo die Person
    // vorher gewohnt hat — und die alte Wohnung behielte ihren Namen. Dasselbe
    // gilt für `active` und `username`: ob es ein Wechsel war, sieht man nur im
    // Vorher.
    const before = await this.prisma.person.findFirst({
      where: { id, hauskreisId },
      select: {
        locationId: true,
        active: true,
        username: true,
        keycloakUserId: true,
      },
    });

    // Erst dort, dann hier. Keycloak ist die Instanz, die den Namen realmweit
    // vergibt; schriebe die App zuerst und Keycloak lehnte danach ab, hießen
    // die beiden verschieden — genau der Zustand, den dieses Feld beendet.
    await this.syncUsername(before, dto.username);

    const updated = await updateWithVersionCheck({
      condition,
      update: (versionConstraint) =>
        this.prisma.person.updateMany({
          where: { id, hauskreisId, ...versionConstraint },
          data: {
            name: dto.name,
            email: dto.email,
            birthdate: dto.birthdate ? new Date(dto.birthdate) : undefined,
            username: dto.username,
            role: dto.role,
            playsInstrument: dto.playsInstrument,
            canHost: dto.canHost,
            autoAttend: dto.autoAttend,
            // `undefined` leaves it alone, `null` moves the person out of the
            // hosting rotation without touching anything else.
            locationId: dto.locationId,
            active: dto.active,
            version: { increment: 1 },
          },
        }),
      exists: () =>
        this.prisma.person.findFirst({ where: { id, hauskreisId } }),
      reload: () => this.findOne(hauskreisId, id),
      notFoundMessage: `Person ${id} not found`,
    });

    await this.syncHomes(before?.locationId, updated.locationId);

    // Die Gebetsbuddys hängen an der Menge der aktiven Menschen — nur daran.
    // Ein neuer Name oder eine neue Wohnung ändert die Paarungen nicht.
    if (before && dto.active !== undefined && dto.active !== before.active) {
      await this.replanPrayerBuddies(hauskreisId);
    }

    // Rückwirkend, und das ist der Sinn: wer den Schalter umlegt, meint die
    // sieben Dienstage, die er gerade vor sich sieht — nicht erst den achten.
    //
    // Beim Ausschalten passiert nichts. Was zugesagt ist, bleibt zugesagt: eine
    // Zusage stillschweigend zurückzunehmen wäre eine Absage, die niemand
    // ausgesprochen hat.
    if (dto.autoAttend === true) {
      await this.autoAttendance.apply(hauskreisId, { personId: id });
    }

    return updated;
  }

  /**
   * Wer wen zum Admin machen darf — und wer sich nicht selbst degradieren kann.
   *
   * Zwei Regeln, und die zweite ist die wichtigere: **die letzte Admin-Person
   * kann sich die Rechte nicht selbst nehmen.** Sonst stünde eine Gruppe da, in
   * der niemand mehr einladen darf und die sich auch nicht mehr selbst helfen
   * kann — derselbe Sackgassen-Fall, den `leave` mit der Nachfolge löst, nur
   * ohne die Tür, durch die man dort noch hinauskommt.
   */
  private async assertMayChangeRole(
    hauskreisId: string,
    id: string,
    role: PersonRole | undefined,
    actor: HauskreisMembership | undefined,
  ): Promise<void> {
    if (role === undefined) {
      return;
    }

    if (actor?.role !== PersonRole.ADMIN) {
      throw new ForbiddenException(
        'Nur Admins können Rechte vergeben oder entziehen',
      );
    }

    if (role === PersonRole.ADMIN || actor.id !== id) {
      return;
    }

    const admins = await this.prisma.person.count({
      where: { hauskreisId, active: true, role: PersonRole.ADMIN },
    });

    if (admins <= 1) {
      throw new BadRequestException(
        'Du bist die einzige Person mit Admin-Rechten. Ernenne zuerst jemand anderen.',
      );
    }
  }

  /**
   * Schreibt einen geänderten Nutzernamen nach Keycloak — bevor er hier landet.
   *
   * Ohne das hießen dieselben Menschen an zwei Stellen verschieden, und die
   * Anmeldung mit dem neuen Namen schlüge fehl. Das Feld wäre dann eine
   * Anzeige und keine Einstellung.
   *
   * Wer noch kein Konto verknüpft hat (offene Einladung), bekommt seinen Namen
   * ohnehin beim Aktivieren; hier gibt es nichts abzugleichen.
   */
  private async syncUsername(
    before: { username: string | null; keycloakUserId: string | null } | null,
    username: string | undefined,
  ): Promise<void> {
    if (!username || !before || username === before.username) {
      return;
    }

    if (before.keycloakUserId) {
      await this.keycloakAdmin.changeUsername(before.keycloakUserId, username);
    }
  }

  /**
   * Entfernt eine Person — und bei einer offenen Einladung auch das Konto.
   *
   * Wer noch nie da war, ist eine zurückgezogene Einladung: bliebe das
   * Keycloak-Konto stehen, könnte sich jemand damit anmelden und landete auf
   * „du bist noch nicht eingetragen", ohne dass ein erneutes Einladen ginge
   * (die Adresse wäre belegt).
   *
   * Bei jemandem, der schon da war, bleibt das Konto: es gehört einem Menschen
   * und nicht dieser Gruppe.
   *
   * **Sich selbst entfernt hier niemand.** Nicht, weil es technisch nicht ginge,
   * sondern weil dieser Weg die falschen Fragen nicht stellt: Er klärt die
   * Nachfolge nicht (wer übernimmt die Admin-Rechte?). Wer sich hier selbst
   * herausnähme, bekäme das Sackgassen-Ergebnis, das `assertMayChangeRole` und
   * `leave` an ihren Stellen gerade verhindern — im schlimmsten Fall eine
   * Gruppe ohne Admin, die sich nicht mehr helfen kann.
   *
   * Es gibt also eine Tür, sie liegt nur woanders — und der Satz unten sagt, wo.
   *
   * **Zwei Fälle, zwei Ausgänge.**
   *
   * Wer schon einmal da war, wird *hinausbegleitet*, nicht gelöscht: derselbe
   * Weg wie beim eigenen Verlassen. Vorher stand hier ein `person.delete`, und
   * das war der schwerere der beiden Fehler — an der Zeile hängen
   * `MeetingAttendance`, `TopicSessionResponsible`, `MeetingSongLeader`,
   * `MeetingActionstepDone` und `MeetingTopicResponsible` mit `onDelete:
   * Cascade`. Ein Admin, der jemanden entfernte, löschte damit dessen ganze
   * Anwesenheit im Archiv, und die gehosteten Abende verloren ihren Gastgeber.
   * Genau das löchrige Archiv, vor dem CLAUDE.md §5 warnt. Nebenbei blieben
   * offene Rollen in kommenden Terminen unbemerkt stehen, und niemand erfuhr
   * davon.
   *
   * **Name und E-Mail bleiben dabei stehen** — anders als beim Konto-Löschen.
   * Entfernt zu werden ist nicht dasselbe wie vergessen werden zu wollen, und
   * die Adresse ist der Schlüssel zurück: eine neue Einladung an dieselbe
   * Adresse weckt genau diese Zeile wieder auf (`invite`), samt allem, was im
   * Archiv an ihr hängt.
   *
   * Wer noch nie da war, ist eine zurückgezogene Einladung und wird weiterhin
   * hart gelöscht. Da hängt nichts dran, und die Adresse muss für eine neue
   * Einladung wieder frei werden.
   */
  async remove(hauskreisId: string, id: string, actor: HauskreisMembership) {
    if (actor.id === id) {
      throw new BadRequestException(
        'Dich selbst kannst du hier nicht entfernen. Wenn du gehen möchtest, geht das im Profil über „Hauskreis verlassen" — dort wird auch geklärt, wer die Admin-Rechte übernimmt.',
      );
    }

    const person = await this.prisma.person.findFirst({
      where: { id, hauskreisId },
      select: {
        id: true,
        email: true,
        locationId: true,
        acceptedAt: true,
        active: true,
      },
    });

    if (!person) {
      throw new NotFoundException(`Person ${id} not found`);
    }

    // Schon draußen. Kann vorkommen, wenn zwei Admins dieselbe Liste offen
    // haben — der zweite Klick ist dann keine Panne, sondern schon erledigt.
    if (!person.active) return;

    if (person.acceptedAt !== null) {
      // Nachgeschlagen statt hineingereicht, aus demselben Grund wie bei
      // `replanPrayerBuddies`: `HauskreisModule` importiert `PersonModule`,
      // andersherum stünde der Kreis. Und es ist auch hier keine
      // Zusammenarbeit, sondern eine Folge — jemand verlässt die Gruppe, nur
      // hat es diesmal ein anderer angestoßen.
      //
      // Über eine Zeichenkette und **nicht** über die Klasse: Die Klasse wäre
      // ein Wert und damit ein echter Import, und der schlösse den Kreis auf
      // Modulebene — `membership.service.ts` importiert diese Datei bereits.
      // In CommonJS stünde `PersonService` dort beim Auswerten der Dekoratoren
      // auf `undefined`, und Nest fände seine Abhängigkeit nicht mehr. Der
      // Typ oben ist reine Typinformation und wird beim Übersetzen entfernt.
      const memberships = this.moduleRef.get<MembershipService>(
        MEMBERSHIP_SERVICE,
        { strict: false },
      );

      // Ohne Nachfolgewunsch: Der Server sucht sich einen, wenn er muss. Ein
      // Admin, der jemanden entfernt, soll nicht plötzlich vor der Frage
      // stehen, wer dessen Rechte erbt.
      await memberships.leave(hauskreisId, id, {}, actor.id);
      return;
    }

    // Eine zurückgezogene Einladung: die Zeile geht ganz, sie trägt keine
    // Geschichte. Die Gebetsrotation bleibt in Ruhe — dort stand die Person
    // nie, sie war ja noch nie da.
    await this.prisma.person.delete({ where: { id } });
    await this.syncHomes(person.locationId);
    await this.discardInvitationAccount(person.email);
  }

  /**
   * Konto löschen, wenn man zu **keinem** Hauskreis gehört.
   *
   * Bis hierher gab es diesen Weg nicht: „Konto löschen" hing im Profil und
   * damit an einer Mitgliedschaft. Wer sich registrierte und nie irgendwo
   * ankam — oder seinen Hauskreis verließ und dann aufhören wollte —, saß auf
   * einem Konto, das er selbst nicht mehr loswurde. Genau die Menschen, die
   * am wenigsten von der App haben, hatten also keinen Ausgang.
   *
   * Der andere Weg (`MembershipService.deleteAccount`) bleibt für alle, die
   * noch dabei sind: dort hängt die Nachfolge dran, und die kann hier nicht
   * aufkommen. Wer trotzdem noch verknüpft ist, wird dorthin verwiesen statt
   * still an der Frage vorbeigelassen.
   *
   * Aufgeräumt wird in drei Schritten, und die Reihenfolge ist Absicht — der
   * unwiderrufliche Teil (Keycloak) kommt zuletzt:
   *
   * 1. **Vergangene Mitgliedschaften** werden anonymisiert, nicht gelöscht.
   *    Dieselbe Regel wie überall (CLAUDE.md §5): Die Zeile trägt, wer damals
   *    gehostet hat. Was verschwindet, sind Name, Adresse und Geburtstag.
   * 2. **Offene Einladungen** werden ganz entfernt. Sie tragen keine
   *    Geschichte — niemand war je da —, und stehen zu lassen hieße, die
   *    Adresse eines gelöschten Kontos in einer fremden Liste zu behalten.
   * 3. **Das Keycloak-Konto**, und daran scheitert der Rest nicht: Bis dahin
   *    sind die persönlichen Angaben weg, und das ist der Teil, um den es
   *    geht. Ein Fehler jetzt hieße, jemandem eine Panne zu melden für etwas,
   *    das passiert ist.
   */
  async deleteOrphanedAccount(user: AuthenticatedUser): Promise<void> {
    const linked = await this.prisma.person.findUnique({
      where: { keycloakUserId: user.keycloakUserId },
      select: { id: true },
    });

    if (linked) {
      throw new ConflictException(
        'Du gehörst noch zu einem Hauskreis. Verlasse ihn zuerst — im Profil steht dafür „Konto löschen", und dort wird auch geklärt, wer die Admin-Rechte übernimmt.',
      );
    }

    // Ohne Adresse gibt es hier nichts zuzuordnen; das Konto selbst kann
    // trotzdem weg.
    const rows = user.email
      ? await this.prisma.person.findMany({
          where: { email: user.email, keycloakUserId: null },
          select: {
            id: true,
            hauskreisId: true,
            locationId: true,
            active: true,
          },
        })
      : [];

    const past = rows.filter((row) => !row.active);
    const invitations = rows.filter((row) => row.active);

    if (past.length > 0) {
      const ids = past.map((row) => row.id);

      await this.prisma.person.updateMany({
        where: { id: { in: ids } },
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
      //
      // Die **Gebetsanliegen** gehören dazu und sind der heikelste Posten der
      // Liste: „bitte betet für meine Mutter" ist nichts, was unter
      // „Ehemaliges Mitglied" stehen bleiben darf. Anders als „wer hat
      // gehostet" trägt es keine Geschichte, die dem Archiv fehlen würde.
      await this.prisma.$transaction([
        this.prisma.pushSubscription.deleteMany({
          where: { personId: { in: ids } },
        }),
        this.prisma.notificationPreference.deleteMany({
          where: { personId: { in: ids } },
        }),
        this.prisma.notificationLog.deleteMany({
          where: { personId: { in: ids } },
        }),
        this.prisma.absencePeriod.deleteMany({
          where: { personId: { in: ids } },
        }),
        this.prisma.meetingPrayerRequest.deleteMany({
          where: { personId: { in: ids } },
        }),
      ]);
    }

    for (const invitation of invitations) {
      await this.prisma.person.delete({ where: { id: invitation.id } });
      await this.syncHomes(invitation.locationId);
      // Kein Neuaufbau der Gebetsrotation mehr: Eine offene Einladung stand nie
      // darin (siehe `invite`), ihr Wegfallen ändert an den Gruppen also
      // nichts.
    }

    try {
      await this.keycloakAdmin.deleteUser(user.keycloakUserId);
    } catch (error) {
      this.logger.error(
        `Konto ${user.keycloakUserId} anonymisiert, aber das Keycloak-Konto blieb stehen`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Räumt das Keycloak-Konto einer Einladung weg, die nie angenommen wurde.
   *
   * **Nur, wenn es die einzige Spur war**: wer die App schon in einem anderen
   * Hauskreis benutzt, verliert sonst durch eine zurückgezogene Einladung
   * seinen Zugang. Deshalb zählt die Methode selbst nach — und deshalb gehört
   * sie hierher und nicht in die zwei Aufrufer (eine zurückgezogene Einladung,
   * ein aufgelöster Hauskreis).
   *
   * Aufzurufen **nach** dem Löschen der Zeile, sonst zählt sie sich selbst mit.
   *
   * `null` ist kein Fehler, sondern eine anonymisierte Zeile: die hat kein
   * Konto mehr, das sich wegräumen ließe.
   */
  async discardInvitationAccount(email: string | null): Promise<void> {
    if (!email) return;

    const elsewhere = await this.prisma.person.count({ where: { email } });

    if (elsewhere === 0) {
      await this.keycloakAdmin.deleteUserByEmail(email);
    }
  }

  /**
   * Guards the multi-tenant boundary: the foreign key alone would happily point
   * a person at a home from another Hauskreis.
   */
  private async assertLocationBelongsToHauskreis(
    hauskreisId: string,
    locationId: string | null | undefined,
  ): Promise<void> {
    if (!locationId) {
      return;
    }

    const location = await this.prisma.location.findFirst({
      where: { id: locationId, hauskreisId },
    });

    if (!location) {
      throw new BadRequestException(
        `Location ${locationId} does not belong to this Hauskreis`,
      );
    }
  }

  /**
   * Die ehemaligen Mitglieder, deren Konto gelöscht wurde — mit genug
   * Geschichte, um sie auseinanderzuhalten.
   *
   * Sie heißen alle „Ehemaliges Mitglied" und haben keine Adresse mehr; ohne
   * das Drumherum wäre die Liste eine Reihe identischer Zeilen, aus der
   * niemand wählen könnte. Was bleibt, ist das, was sie getan haben: von wann
   * bis wann sie dabei waren, wie oft sie gehostet und wie viele Einheiten sie
   * gehalten haben. In einer Gruppe von neun genügt das.
   *
   * Wer den Hauskreis nur verlassen hat, steht hier **nicht**: Name und
   * Adresse sind noch da, eine Einladung findet die Zeile von selbst.
   */
  async findFormerMembers(hauskreisId: string) {
    const rows = await this.prisma.person.findMany({
      where: { hauskreisId, active: false, anonymizedAt: { not: null } },
      select: { id: true, createdAt: true, anonymizedAt: true },
      orderBy: { anonymizedAt: 'desc' },
    });

    return Promise.all(
      rows.map(async (row) => {
        const [hostedCount, sessionCount, attendedCount, lastHosted] =
          await Promise.all([
            this.prisma.meeting.count({ where: { hostPersonId: row.id } }),
            this.prisma.topicSessionResponsible.count({
              where: { personId: row.id },
            }),
            this.prisma.meetingAttendance.count({
              where: { personId: row.id },
            }),
            this.prisma.meeting.findFirst({
              where: { hostPersonId: row.id },
              orderBy: { date: 'desc' },
              select: { date: true },
            }),
          ]);

        return {
          id: row.id,
          joinedAt: row.createdAt,
          anonymizedAt: row.anonymizedAt,
          hostedCount,
          sessionCount,
          attendedCount,
          lastHostedDate: lastHosted?.date ?? null,
        };
      }),
    );
  }

  /**
   * Prüft, ob die ausgewählte Zeile wirklich eine wiedererkennbare Vergangene
   * ist — und ob die Adresse dafür überhaupt frei ist.
   */
  private async resolveFormerMember(
    hauskreisId: string,
    formerPersonId: string,
    byEmail: { id: string; name: string } | null,
  ): Promise<{ id: string; name: string }> {
    const former = await this.prisma.person.findFirst({
      where: {
        id: formerPersonId,
        hauskreisId,
        active: false,
        anonymizedAt: { not: null },
      },
      select: { id: true, name: true },
    });

    if (!former) {
      throw new BadRequestException(
        'Diese ehemalige Zeile gibt es nicht mehr — lade ohne die Zuordnung ein.',
      );
    }

    // Die Adresse gehört im selben Hauskreis schon einer anderen Zeile. Sie
    // hier einzutragen liefe in `@@unique([hauskreisId, email])`; die Meldung
    // daraus wäre ein Datenbankfehler statt einer Auskunft.
    if (byEmail && byEmail.id !== former.id) {
      throw new ConflictException(
        `Zu dieser Adresse gibt es hier schon eine Zeile (${byEmail.name}). Beides zusammenzuführen geht nicht.`,
      );
    }

    return former;
  }

  /**
   * Creates the Keycloak account first, then the local person row. If the
   * local insert fails we roll the Keycloak user back, so a failed invite
   * never leaves an orphaned account behind.
   */
  async invite(hauskreisId: string, dto: InvitePersonDto) {
    // Wer schon einmal hier war, hat eine Zeile: sie bleibt beim Verlassen
    // stehen, damit vergangene Abende weiter zeigen, wer gehostet hat. Ohne
    // diesen Blick wäre eine zweite Einladung an dieselbe Adresse ein Verstoß
    // gegen `@@unique([hauskreisId, email])` — wer einmal gegangen ist, käme
    // nie wieder herein.
    const byEmail = await this.prisma.person.findFirst({
      where: { hauskreisId, email: dto.email },
      select: { id: true, active: true, name: true },
    });

    if (byEmail?.active) {
      throw new ConflictException(`${byEmail.name} ist schon dabei`);
    }

    // Der ausdrückliche Weg zurück für ein gelöschtes Konto. Er schlägt die
    // Suche über die Adresse nicht, er ersetzt sie: dort steht keine mehr.
    const former = dto.formerPersonId
      ? await this.resolveFormerMember(hauskreisId, dto.formerPersonId, byEmail)
      : null;

    const previous = former ?? byEmail;

    const { created, invitationEmailSent } =
      await this.keycloakAdmin.inviteUser({ email: dto.email });

    const role = dto.role === 'admin' ? PersonRole.ADMIN : PersonRole.MEMBER;

    let person;

    try {
      // **Ohne `keycloakUserId`.** Eine Einladung nimmt niemandem seine
      // bestehende Mitgliedschaft weg — sie ist ein Angebot, bis der Mensch
      // sie annimmt. Verknüpft wird beim ersten Anmelden (`resolveForUser`)
      // oder ausdrücklich über `POST /api/me/invitations/{id}/accept`.
      person = previous
        ? await this.prisma.person.update({
            where: { id: previous.id },
            // Dieselbe Zeile wieder aufwecken statt einer zweiten: so bleibt
            // die Geschichte an der Person, die sie gemacht hat.
            data: {
              role,
              active: true,
              acceptedAt: null,
              keycloakUserId: null,
              // Auch den Nutzernamen: die Person wählt ihn beim Aktivieren neu,
              // und bis dahin darf er niemanden blockieren.
              username: null,
              // Die Adresse zurückgeben und das Vergessen zurücknehmen. Für
              // die Zeile, die über die Adresse gefunden wurde, ändert das
              // nichts — sie hat beides längst. Für eine wiedererkannte steht
              // hier `null` beziehungsweise ein alter Zeitstempel, und ohne
              // diese zwei Zeilen bliebe sie „Ehemaliges Mitglied" mit einer
              // Löschmarkierung, obwohl gerade jemand eingeladen wurde.
              email: dto.email,
              anonymizedAt: null,
              ...(former
                ? // Platzhalter bis zur ersten Anmeldung, wie bei einer neuen
                  // Einladung. „Ehemaliges Mitglied" stehen zu lassen hieße,
                  // in der Mitgliederliste eine Einladung an einen Namen zu
                  // zeigen, den niemand trägt.
                  { name: localPartOf(dto.email) }
                : {}),
            },
          })
        : await this.prisma.person.create({
            data: {
              hauskreisId,
              // Ein Platzhalter, bis die Person sich zum ersten Mal anmeldet —
              // dann übernimmt `resolveForUser` den selbst gewählten Namen. Die
              // Adresse ganz anzuzeigen wäre in einer Mitgliederliste zu viel.
              name: localPartOf(dto.email),
              email: dto.email,
              role,
            },
          });
    } catch (error) {
      // Nur aufräumen, was diese Einladung selbst angelegt hat: ein Konto, das
      // vorher schon da war, gehört einem Menschen, der die App benutzt.
      if (created) await this.keycloakAdmin.deleteUserByEmail(dto.email);
      throw error;
    }

    // Hier stand einmal ein Neuaufbau der Gebetsrotation, mit der Begründung
    // „wer eingeladen ist, gehört dazu, er wartet sonst zehn Wochen auf seine
    // ersten Buddys". Das Warten stimmte, der Schluss nicht: Ein Name in einer
    // Gebetsgruppe, dem niemand schreiben kann, lässt sein Gegenüber zwei
    // Wochen allein beten — schlechter als Warten. Die Rotation zieht jetzt
    // nach, wenn die Einladung **angenommen** wird (`resolveForUser`,
    // `MembershipService.acceptInvitation`), und das ist der Augenblick, in dem
    // wirklich jemand dazukommt.

    return { ...person, invitationEmailSent };
  }

  /**
   * Schickt die Einladungsmail noch einmal.
   *
   * Der Fall, für den es das gibt: beim Einladen war der Mailserver nicht
   * erreichbar. Das Konto steht dann und die Person ist angelegt — es fehlt nur
   * die Mail. Die Einladung deshalb scheitern zu lassen wäre falsch: es würde
   * beides wieder abräumen, obwohl nur der Versand klemmte.
   */
  async resendInvitation(
    hauskreisId: string,
    id: string,
  ): Promise<{ invitationEmailSent: boolean }> {
    const person = await this.prisma.person.findFirst({
      where: { id, hauskreisId },
      select: { email: true, acceptedAt: true, name: true },
    });

    if (!person) {
      throw new NotFoundException(`Person ${id} not found`);
    }

    if (person.acceptedAt !== null) {
      throw new BadRequestException(
        `${person.name} ist schon da — eine zweite Einladung würde nichts ändern`,
      );
    }

    // Unerreichbar, aber nicht wegzulassen: ohne Adresse gibt es kein Konto,
    // an das sich etwas schicken ließe. Eine offene Einladung hat immer eine —
    // `null` steht dort erst, wenn jemand sein Konto gelöscht hat, und dazu
    // muss er erst einmal angekommen sein.
    if (!person.email) {
      throw new BadRequestException(
        `${person.name} hat keine Adresse mehr, an die sich einladen ließe`,
      );
    }

    const invitationEmailSent = await this.keycloakAdmin.resendInvitation(
      person.email,
    );

    return { invitationEmailSent };
  }

  /**
   * „Hier wohne ich" — die eigene Adresse als Zuhause eintragen.
   *
   * Ein eigener Weg statt dreier Aufrufe (auflösen, anlegen, Person ändern):
   * bricht der zweite ab, bliebe sonst eine Wohnung ohne Bewohner:innen
   * zurück, die niemand mehr zuordnen kann.
   *
   * `joinExisting` ist die Bestätigung, dass man wirklich zu den Leuten zieht,
   * die dort schon wohnen. Ohne sie wird abgelehnt: gleiche Anschrift ist ein
   * starkes Indiz für eine Wohngemeinschaft, aber ein Tippfehler sieht genauso
   * aus — und ein stiller Zusammenzug halbierte still das Host-Gewicht beider.
   */
  async setHome(
    user: AuthenticatedUser,
    dto: { address: string; capacity?: number | null; joinExisting?: boolean },
  ) {
    const person = await this.resolveForUser(user);

    const { location: existing } = await this.locations.resolveAddress(
      person.hauskreisId,
      dto.address,
    );

    if (existing) {
      const others = existing.residents.filter(
        (resident) => resident.id !== person.id,
      );

      if (others.length > 0 && dto.joinExisting !== true) {
        const who = others.map((resident) => resident.name).join(', ');

        throw new ConflictException(
          `Unter dieser Anschrift wohnt schon jemand (${who}). Bestätige, dass ihr zusammen wohnt.`,
        );
      }
    }

    const home = await this.locations.claimHome(person.hauskreisId, {
      address: dto.address,
      capacity: dto.capacity,
    });

    const previousLocationId = person.locationId;

    await this.prisma.person.update({
      where: { id: person.id },
      data: { locationId: home.id, version: { increment: 1 } },
    });

    await this.syncHomes(previousLocationId, home.id);

    return this.locations.findOne(person.hauskreisId, home.id);
  }

  /** „Ich bringe keine Wohnung mit" — ein gültiger Zustand, kein Fehler. */
  async clearHome(user: AuthenticatedUser) {
    const person = await this.resolveForUser(user);

    if (person.locationId === null) {
      return;
    }

    await this.prisma.person.update({
      where: { id: person.id },
      data: { locationId: null, version: { increment: 1 } },
    });

    await this.syncHomes(person.locationId);
  }

  /**
   * Die eigene E-Mail ändern — in Keycloak **und** hier.
   *
   * Keycloak zuerst: schlägt es dort fehl, ist nichts passiert. Schlägt
   * danach die eigene Zeile fehl, wird die Adresse dort zurückgedreht, damit
   * nicht die Anmeldung auf die neue und die App auf die alte zeigt. Dasselbe
   * Muster wie beim Einladen.
   *
   * Ausgesperrt wird dabei niemand: `resolveForUser` findet die Person über
   * die `keycloakUserId`, nicht über die Adresse.
   */
  async changeEmail(user: AuthenticatedUser, email: string) {
    const person = await this.resolveForUser(user);

    if (person.email === email) {
      return {
        ...(await this.findOne(person.hauskreisId, person.id)),
        verificationEmailSent: false,
      };
    }

    const taken = await this.prisma.person.findFirst({
      where: {
        hauskreisId: person.hauskreisId,
        email,
        id: { not: person.id },
      },
    });

    if (taken) {
      throw new ConflictException(
        `${email} gehört im Hauskreis schon zu ${taken.name}`,
      );
    }

    if (!person.keycloakUserId) {
      throw new BadRequestException(
        'Zu diesem Konto gibt es keine Anmeldung, die sich ändern ließe',
      );
    }

    const verificationEmailSent = await this.keycloakAdmin.changeEmail(
      person.keycloakUserId,
      email,
    );

    try {
      await this.prisma.person.update({
        where: { id: person.id },
        data: { email, version: { increment: 1 } },
      });
    } catch (error) {
      // Zurückdrehen, damit Keycloak und Datenbank nicht auf zwei Adressen
      // zeigen. Ohne alte Adresse gibt es nichts zurückzudrehen — den Fall
      // gibt es nur bei einer anonymisierten Zeile, und die kommt hier nicht
      // an: `resolveForUser` findet sie nicht mehr.
      if (person.email) {
        await this.keycloakAdmin
          .changeEmail(person.keycloakUserId, person.email)
          .catch(() => undefined);
      }
      throw error;
    }

    return {
      ...(await this.findOne(person.hauskreisId, person.id)),
      verificationEmailSent,
    };
  }

  /**
   * Die Bestätigungsmail noch einmal.
   *
   * Bewusst ohne `resolveForUser`: Wer hier landet, ist im `AuthGuard` gerade
   * abgewiesen worden, und der Weg über die Person würde eine Zeile verlangen,
   * die es womöglich noch gar nicht gibt — bei jemandem, der sich eben erst
   * registriert hat, ist das der Normalfall. Das Token reicht: `sub` benennt
   * das Konto, und mehr braucht Keycloak nicht.
   */
  async resendVerification(
    user: AuthenticatedUser,
  ): Promise<{ verificationEmailSent: boolean }> {
    return {
      verificationEmailSent: await this.keycloakAdmin.resendVerification(
        user.keycloakUserId,
      ),
    };
  }

  /**
   * Resolves the person row for a logged-in Keycloak user. On first login the
   * row is still unlinked, so we match it by email and attach the subject id.
   *
   * **Hier kommt jemand an**, und das ist der Augenblick, in dem er in die
   * Gebetsrotation gehört — nicht schon beim Einladen (siehe `invite`). Beide
   * Zweige unten führen dorthin: das erste Anmelden auf eine bereits verknüpfte
   * Zeile, und die Zuordnung über die Adresse.
   */
  async resolveForUser(user: AuthenticatedUser) {
    const linked = await this.prisma.person.findUnique({
      where: { keycloakUserId: user.keycloakUserId },
    });

    if (linked) {
      // Hier steht fest, dass wirklich jemand vor dem Bildschirm saß — und nur
      // hier. Das Keycloak-Konto entsteht schon beim Einladen, es sagt also
      // nichts darüber, ob die Einladung angenommen wurde.
      const firstLogin = linked.acceptedAt === null;
      const arrival = firstLogin ? new Date() : undefined;
      const naming = namingFromToken(user, linked, firstLogin);

      const person =
        arrival || naming
          ? await this.prisma.person.update({
              where: { id: linked.id },
              data: { acceptedAt: arrival, ...naming },
            })
          : linked;

      if (firstLogin) await this.welcomeIntoRotation(person.hauskreisId);

      return person;
    }

    if (!user.email) {
      throw new NotFoundException(
        'No person record is linked to this account and the token carries no email to match on',
      );
    }

    // Offene Einladungen: Zeilen mit dieser Adresse, die noch niemandem
    // gehören. `active: true` schließt aus, was jemand verlassen hat — sonst
    // holte der nächste Login ihn in den Hauskreis zurück, aus dem er gerade
    // gegangen ist.
    const invitations = await this.prisma.person.findMany({
      where: { email: user.email, keycloakUserId: null, active: true },
      select: { id: true },
    });

    if (invitations.length === 0) {
      throw new NotFoundException(
        `No person record found for ${user.email}. Ask an admin to invite you.`,
      );
    }

    // Mehr als eine: dann entscheidet ein Mensch, nicht die Reihenfolge, in
    // der Postgres die Zeilen zurückgibt. Das Frontend zeigt dafür die
    // Einladungen aus `GET /api/me/invitations` zur Auswahl.
    if (invitations.length > 1) {
      throw new NotFoundException(
        `Mehrere offene Einladungen für ${user.email}. Wähle eine aus.`,
      );
    }

    const person = await this.prisma.person.update({
      where: { id: invitations[0]!.id },
      data: {
        keycloakUserId: user.keycloakUserId,
        acceptedAt: new Date(),
        // Erste Anmeldung per Definition: die Zeile gehörte bis eben niemandem.
        ...namingFromToken(user, { username: null }, true),
      },
    });

    await this.welcomeIntoRotation(person.hauskreisId);

    return person;
  }

  /**
   * Nimmt jemanden in die Gebetsrotation auf, der gerade zum ersten Mal da ist.
   *
   * **Fehler werden geschluckt, und das ist der Kern dieser Methode.** Sie läuft
   * im Anfrageweg — `resolveForUser` steht am Anfang jeder authentifizierten
   * Anfrage —, und zwar ausgerechnet bei der allerersten. Ginge sie schief und
   * risse die Anfrage mit, bestünde die Begrüßung in dieser App aus einer
   * Fehlermeldung, und zwar wegen einer Sache, die den neuen Menschen in diesem
   * Moment am wenigsten interessiert. Der Cron um vier Uhr baut ohnehin nach.
   */
  private async welcomeIntoRotation(hauskreisId: string): Promise<void> {
    try {
      await this.replanPrayerBuddies(hauskreisId);
    } catch (error) {
      this.logger.error(
        `Erste Anmeldung in Hauskreis ${hauskreisId}, aber die Gebetsrotation ließ sich nicht nachziehen`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

/**
 * Der Teil vor dem `@`. Ein Platzhalter-Anzeigename für die Zeit zwischen
 * Einladung und erster Anmeldung — besser als eine leere Zeile und weniger als
 * die ganze Adresse.
 */
function localPartOf(email: string): string {
  return email.split('@')[0] ?? email;
}

/**
 * Übernimmt den Nutzernamen aus dem Token — und beim allerersten Mal auch den
 * Anzeigenamen.
 *
 * Den Nutzernamen hat der Mensch gerade in Keycloak **selbst gewählt**; genau
 * der soll in der App stehen, sonst hießen dieselben Leute an zwei Stellen
 * verschieden.
 *
 * Der **Anzeigename** wird nur bei der ersten Anmeldung vorbelegt, und das ist
 * das richtige Signal: bis dahin steht dort, was jemand anders beim Einladen
 * eingetippt hat — nach der Einladungsreform der lokale Teil der Adresse. Danach
 * ist er entweder selbst gewählt oder von hier, und ihn bei jeder Anmeldung neu
 * zu überschreiben nähme eine Entscheidung zurück, die jemand im Profil
 * getroffen hat.
 *
 * `undefined`, wenn nichts zu tun ist — dann spart der Aufrufer den Schreibweg.
 */
function namingFromToken(
  user: AuthenticatedUser,
  current: { username: string | null },
  firstLogin: boolean,
): { username: string; name?: string } | undefined {
  if (!user.username || user.username === current.username) {
    return undefined;
  }

  return {
    username: user.username,
    ...(firstLogin ? { name: user.username } : {}),
  };
}
