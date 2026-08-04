import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { updateWithVersionCheck } from '../common/http/optimistic-update';
import type { IfMatchCondition } from '../common/http/etag';
import type { CreateLocationDto, UpdateLocationDto } from './dto/location.dto';
import { homeName, normalizeAddress } from './address';

/**
 * Wer hier wohnt. Zwei Dinge hängen daran: der Name eines Zuhauses und die
 * Frage, ob ein Ort überhaupt eins ist.
 *
 * Exportiert, weil `locationResponseSchema` `residents` **verlangt** und jede
 * Stelle, die einen ganzen Ort ausliefert, ihn deshalb mitladen muss. Genau
 * das ging einmal auseinander: der Termin lieferte seinen Ort mit `location:
 * true`, das Feld fehlte, und jede Terminliste kam als 500 zurück. Ein
 * gemeinsames Include statt zweier Kopien macht daraus einen Fehler, den man
 * gar nicht erst machen kann.
 */
export const locationInclude = {
  residents: {
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  },
} as const;

/**
 * Der Schlüssel zu einer geänderten Anschrift — mit derselben Dreiteilung, die
 * Prisma bei einem Update erwartet: `undefined` lässt in Ruhe, `null` löscht.
 */
function nextAddressKey(
  address: string | null | undefined,
): string | null | undefined {
  if (address === undefined || address === null) {
    return address;
  }

  return normalizeAddress(address);
}

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);

  constructor(private readonly prisma: PrismaService) {}

  findAll(hauskreisId: string) {
    return this.prisma.location.findMany({
      where: { hauskreisId },
      include: locationInclude,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(hauskreisId: string, id: string) {
    const location = await this.prisma.location.findFirst({
      where: { id, hauskreisId },
      include: locationInclude,
    });

    if (!location) {
      throw new NotFoundException(`Location ${id} not found`);
    }

    return location;
  }

  /**
   * Sucht die Wohnung zu einer Anschrift.
   *
   * Der Kern der Wohngemeinschafts-Erkennung: trägt die zweite Person
   * dieselbe Adresse ein, kommt hier die Wohnung der ersten zurück — samt
   * Bewohner:innen, damit die Oberfläche fragen kann „Chris wohnt dort schon.
   * Wohnt ihr zusammen?" statt es stillschweigend anzunehmen.
   */
  async resolveAddress(hauskreisId: string, address: string) {
    const addressKey = normalizeAddress(address);

    const location = await this.prisma.location.findFirst({
      where: { hauskreisId, addressKey },
      include: locationInclude,
    });

    return { addressKey, location };
  }

  async create(hauskreisId: string, dto: CreateLocationDto) {
    const address = dto.address ?? null;
    const addressKey = address === null ? null : normalizeAddress(address);

    if (address !== null) {
      const { location } = await this.resolveAddress(hauskreisId, address);

      if (location) {
        throw new ConflictException(
          `Unter dieser Anschrift gibt es schon „${location.name}"`,
        );
      }
    }

    return this.prisma.location.create({
      data: {
        hauskreisId,
        name: dto.name,
        hostWeight: dto.hostWeight,
        capacity: dto.capacity ?? null,
        requiresHost: dto.requiresHost,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        address: dto.address ?? null,
        addressKey,
      },
      include: locationInclude,
    });
  }

  update(
    hauskreisId: string,
    id: string,
    dto: UpdateLocationDto,
    condition?: IfMatchCondition,
  ) {
    return updateWithVersionCheck({
      condition,
      update: (versionConstraint) =>
        this.prisma.location.updateMany({
          where: { id, hauskreisId, ...versionConstraint },
          data: {
            name: dto.name,
            hostWeight: dto.hostWeight,
            // `undefined` leaves it alone, `null` removes the limit.
            capacity: dto.capacity,
            requiresHost: dto.requiresHost,
            // Ebenso: `null` löscht die Position wieder. Das DTO stellt sicher,
            // dass Breite und Länge nur gemeinsam ankommen.
            latitude: dto.latitude,
            longitude: dto.longitude,
            address: dto.address,
            // Der Schlüssel folgt der Anschrift, sonst zeigte er nach einer
            // Korrektur noch auf die alte Wohnung.
            addressKey: nextAddressKey(dto.address),
            active: dto.active,
            version: { increment: 1 },
          },
        }),
      exists: () =>
        this.prisma.location.findFirst({ where: { id, hauskreisId } }),
      reload: () => this.findOne(hauskreisId, id),
      notFoundMessage: `Location ${id} not found`,
    });
  }

  /**
   * Stilllegen — oder wirklich löschen, wenn nichts mehr daran hängt.
   *
   * An einem Ort haben Abende stattgefunden; wäre er weg, stünde im Archiv
   * „irgendwo" (`Meeting.location` ist `onDelete: SetNull`). Solange also ein
   * Termin auf ihn zeigt, bleibt es beim `active = false`.
   *
   * Zeigt keiner mehr auf ihn, gibt es nichts zu bewahren, und ein stillgelegter
   * Ort ohne Geschichte ist bloß eine Karteileiche: dann verschwindet er ganz.
   * Das ist der Normalfall beim Vertippen — Treffpunkt angelegt, Name falsch,
   * nie benutzt.
   */
  async remove(hauskreisId: string, id: string): Promise<RemovalResult> {
    const location = await this.findOne(hauskreisId, id);

    if (location.residents.length > 0) {
      const who = location.residents.map((person) => person.name).join(', ');

      throw new ConflictException(
        `Hier wohnt noch jemand (${who}). Eine Wohnung verschwindet, indem ihre Bewohner:innen im Profil eine andere Adresse eintragen.`,
      );
    }

    return this.forget(id);
  }

  /**
   * Löschen, falls kein Termin daran hängt, sonst stilllegen.
   *
   * Ohne Bewohner:innen-Prüfung — die Aufrufer wissen bereits, dass niemand
   * mehr dort wohnt: `remove` hat es geprüft, `syncHomeName` hat gerade selbst
   * ausgezogen.
   */
  private async forget(id: string): Promise<RemovalResult> {
    const meetings = await this.prisma.meeting.count({
      where: { locationId: id },
    });

    if (meetings === 0) {
      await this.prisma.location.delete({ where: { id } });
      return { deleted: true };
    }

    await this.prisma.location.update({
      where: { id },
      data: { active: false, version: { increment: 1 } },
    });

    return { deleted: false };
  }

  /**
   * Räumt stillgelegte Orte weg, an denen inzwischen kein Termin mehr hängt.
   *
   * Solche Zeilen entstehen von selbst: ein Ort wird stillgelegt, während noch
   * ein kommender Termin auf ihn zeigt, und der Termin wird später umgelegt
   * oder abgesagt. Danach merkt es niemand mehr — deshalb ein Wartungslauf und
   * kein Aufräumen an zwanzig Stellen.
   */
  async purgeAbandoned(hauskreisId: string): Promise<{ deleted: number }> {
    const abandoned = await this.prisma.location.findMany({
      where: {
        hauskreisId,
        active: false,
        residents: { none: {} },
        meetings: { none: {} },
      },
      select: { id: true },
    });

    if (abandoned.length === 0) return { deleted: 0 };

    const { count } = await this.prisma.location.deleteMany({
      where: { id: { in: abandoned.map((location) => location.id) } },
    });

    this.logger.log(`Purged ${count} abandoned location(s)`);

    return { deleted: count };
  }

  /**
   * Die Wohnung zu einer Anschrift — vorhandene oder neue.
   *
   * Der Name bleibt hier leer („Ehemaliges Zuhause"): er entsteht erst,
   * wenn jemand einzieht, und das tut `syncHomeName` gleich danach. Ihn hier
   * schon zu setzen hieße, ihn an zwei Stellen zu berechnen.
   */
  async claimHome(
    hauskreisId: string,
    params: { address: string; capacity?: number | null },
  ) {
    const { location } = await this.resolveAddress(hauskreisId, params.address);

    if (location) {
      if (!location.requiresHost) {
        throw new BadRequestException(
          `Unter dieser Anschrift liegt „${location.name}" — ein Treffpunkt, keine Wohnung.`,
        );
      }

      if (params.capacity === undefined) {
        return location;
      }

      return this.prisma.location.update({
        where: { id: location.id },
        data: { capacity: params.capacity, version: { increment: 1 } },
        include: locationInclude,
      });
    }

    return this.prisma.location.create({
      data: {
        hauskreisId,
        name: homeName([]),
        address: params.address,
        addressKey: normalizeAddress(params.address),
        requiresHost: true,
        capacity: params.capacity ?? null,
      },
      include: locationInclude,
    });
  }

  /**
   * Zieht den Namen einer Wohnung an ihren Bewohner:innen nach.
   *
   * Wird von jedem Weg aufgerufen, der jemanden ein- oder auszieht — der
   * Name ist abgeleitet und darf nirgends von Hand gesetzt werden, sonst
   * steht irgendwann „Bei Niko" an einer Wohnung, in der Chris lebt.
   *
   * Zieht die letzte Person aus, wird die Wohnung stillgelegt — oder gelöscht,
   * wenn dort nie ein Abend war. Eine Wohnung, in der niemand mehr wohnt und
   * die Gruppe nie zu Gast war, hat weder Zukunft noch Geschichte.
   */
  async syncHomeName(locationId: string): Promise<void> {
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
      include: locationInclude,
    });

    if (!location || !location.requiresHost) {
      return;
    }

    const names = location.residents.map((person) => person.name);

    if (names.length === 0) {
      await this.forget(locationId);
      return;
    }

    await this.prisma.location.update({
      where: { id: locationId },
      data: {
        name: homeName(names),
        // Wie der Name abgeleitet: eine Wohnung mit Bewohner:innen steht zur
        // Verfügung. Wer eine Weile nicht hosten möchte, sagt das über
        // `canHost` im eigenen Profil — das ist die Aussage einer Person, nicht
        // die einer Wohnung.
        active: true,
        version: { increment: 1 },
      },
    });
  }
}

/** Ob wirklich gelöscht wurde oder nur stillgelegt. */
export interface RemovalResult {
  deleted: boolean;
}
