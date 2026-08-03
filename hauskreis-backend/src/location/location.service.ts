import {
  ConflictException,
  Injectable,
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
 */
const locationInclude = {
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
   * Stilllegen statt löschen.
   *
   * An einem Ort haben Abende stattgefunden; wäre er weg, stünde im Archiv
   * „irgendwo". `active = false` nimmt ihn aus der Auswahl und lässt die
   * Vergangenheit heil.
   */
  async remove(hauskreisId: string, id: string) {
    const location = await this.findOne(hauskreisId, id);

    if (location.residents.length > 0) {
      const who = location.residents.map((person) => person.name).join(', ');

      throw new ConflictException(
        `Hier wohnt noch jemand (${who}). Eine Wohnung verschwindet, indem ihre Bewohner:innen im Profil eine andere Adresse eintragen.`,
      );
    }

    await this.prisma.location.update({
      where: { id },
      data: { active: false, version: { increment: 1 } },
    });
  }

  /**
   * Zieht den Namen einer Wohnung an ihren Bewohner:innen nach.
   *
   * Wird von jedem Weg aufgerufen, der jemanden ein- oder auszieht — der
   * Name ist abgeleitet und darf nirgends von Hand gesetzt werden, sonst
   * steht irgendwann „Bei Niko" an einer Wohnung, in der Chris lebt.
   *
   * Zieht die letzte Person aus, wird die Wohnung stillgelegt: sie hat keine
   * Bewohner:innen mehr, die sie anbieten könnten.
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

    await this.prisma.location.update({
      where: { id: locationId },
      data: {
        name: homeName(names),
        // Wie der Name abgeleitet: eine Wohnung mit Bewohner:innen steht zur
        // Verfügung, eine ohne nicht. Wer eine Weile nicht hosten möchte,
        // sagt das über `canHost` im eigenen Profil — das ist die Aussage
        // einer Person, nicht die einer Wohnung.
        active: names.length > 0,
        version: { increment: 1 },
      },
    });
  }
}
