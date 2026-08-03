import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KeycloakAdminService } from '../auth/keycloak-admin.service';
import { LocationService } from '../location/location.service';
import type { AuthenticatedUser } from '../auth/auth.types';
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
  email: true,
  birthdate: true,
  playsInstrument: true,
  canHost: true,
  locationId: true,
  active: true,
  createdAt: true,
  version: true,
} as const;

@Injectable()
export class PersonService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly keycloakAdmin: KeycloakAdminService,
    private readonly locations: LocationService,
  ) {}

  /**
   * Zieht die Namen der betroffenen Wohnungen nach, nachdem jemand um- oder
   * ausgezogen ist.
   *
   * Beide Seiten, nicht nur die neue: die alte Wohnung heißt sonst weiter
   * „Bei Niko & Chris", obwohl Chris längst woanders wohnt — und bleibt mit
   * ihrem Gewicht in der Host-Rotation, obwohl niemand mehr dort einladen kann.
   */
  private async syncHomes(...locationIds: (string | null | undefined)[]) {
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

  findAll(hauskreisId: string) {
    return this.prisma.person.findMany({
      where: { hauskreisId },
      select: personSelect,
      orderBy: { name: 'asc' },
    });
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
        locationId: dto.locationId ?? null,
      },
    });

    await this.syncHomes(person.locationId);

    return person;
  }

  async update(
    hauskreisId: string,
    id: string,
    dto: UpdatePersonDto,
    condition?: IfMatchCondition,
  ) {
    await this.assertLocationBelongsToHauskreis(hauskreisId, dto.locationId);

    // Vor dem Schreiben, sonst ist nicht mehr feststellbar, wo die Person
    // vorher gewohnt hat — und die alte Wohnung behielte ihren Namen.
    const before =
      dto.locationId === undefined
        ? null
        : await this.prisma.person.findFirst({
            where: { id, hauskreisId },
            select: { locationId: true },
          });

    const updated = await updateWithVersionCheck({
      condition,
      update: (versionConstraint) =>
        this.prisma.person.updateMany({
          where: { id, hauskreisId, ...versionConstraint },
          data: {
            name: dto.name,
            email: dto.email,
            birthdate: dto.birthdate ? new Date(dto.birthdate) : undefined,
            playsInstrument: dto.playsInstrument,
            canHost: dto.canHost,
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

    return updated;
  }

  async remove(hauskreisId: string, id: string) {
    const person = await this.findOne(hauskreisId, id);
    await this.prisma.person.delete({ where: { id } });
    await this.syncHomes(person.locationId);
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
   * Creates the Keycloak account first, then the local person row. If the
   * local insert fails we roll the Keycloak user back, so a failed invite
   * never leaves an orphaned account behind.
   */
  async invite(hauskreisId: string, dto: InvitePersonDto) {
    // Checked before the Keycloak account exists, so a bad location id cannot
    // trigger the rollback path.
    await this.assertLocationBelongsToHauskreis(hauskreisId, dto.locationId);

    const { keycloakUserId, invitationEmailSent } =
      await this.keycloakAdmin.inviteUser({
        email: dto.email,
        name: dto.name,
        role: dto.role,
      });

    try {
      const person = await this.prisma.person.create({
        data: {
          hauskreisId,
          keycloakUserId,
          name: dto.name,
          email: dto.email,
          birthdate: dto.birthdate ? new Date(dto.birthdate) : null,
          playsInstrument: dto.playsInstrument,
          canHost: dto.canHost,
          locationId: dto.locationId ?? null,
        },
      });

      await this.syncHomes(person.locationId);

      return { ...person, invitationEmailSent };
    } catch (error) {
      await this.keycloakAdmin.deleteUser(keycloakUserId);
      throw error;
    }
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
      await this.keycloakAdmin
        .changeEmail(person.keycloakUserId, person.email)
        .catch(() => undefined);
      throw error;
    }

    return {
      ...(await this.findOne(person.hauskreisId, person.id)),
      verificationEmailSent,
    };
  }

  /**
   * Resolves the person row for a logged-in Keycloak user. On first login the
   * row is still unlinked, so we match it by email and attach the subject id.
   */
  async resolveForUser(user: AuthenticatedUser) {
    const linked = await this.prisma.person.findUnique({
      where: { keycloakUserId: user.keycloakUserId },
    });

    if (linked) {
      return linked;
    }

    if (!user.email) {
      throw new NotFoundException(
        'No person record is linked to this account and the token carries no email to match on',
      );
    }

    const unlinked = await this.prisma.person.findFirst({
      where: { email: user.email, keycloakUserId: null },
    });

    if (!unlinked) {
      throw new NotFoundException(
        `No person record found for ${user.email}. Ask an admin to invite you.`,
      );
    }

    return this.prisma.person.update({
      where: { id: unlinked.id },
      data: { keycloakUserId: user.keycloakUserId },
    });
  }
}
