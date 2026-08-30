import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { updateWithVersionCheck } from '../common/http/optimistic-update';
import type { IfMatchCondition } from '../common/http/etag';
import type {
  CreateHauskreisDto,
  UpdateHauskreisDto,
} from './dto/hauskreis.dto';

@Injectable()
export class HauskreisService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Nur die eigenen. Vorher gab diese Route **alle** Hauskreise samt Ids
   * heraus — und weil nichts prüfte, ob man dazugehört, war das ein
   * Inhaltsverzeichnis für fremde Gruppen.
   *
   * Praktisch ist es genau einer: ein Mensch gehört zu einem Hauskreis. Die
   * Liste bleibt trotzdem eine Liste, damit der leere Fall („noch nirgends
   * dabei") kein Sonderweg ist.
   */
  findMine(keycloakUserId: string) {
    return this.prisma.hauskreis.findMany({
      where: { people: { some: { keycloakUserId, active: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const hauskreis = await this.prisma.hauskreis.findUnique({
      where: { id },
    });

    if (!hauskreis) {
      throw new NotFoundException(`Hauskreis ${id} not found`);
    }

    return hauskreis;
  }

  create(dto: CreateHauskreisDto) {
    return this.prisma.hauskreis.create({ data: { name: dto.name } });
  }

  /**
   * Name und Beschreibung ändern.
   *
   * Ohne Admin-Recht, wie das Kopfbild: Bei neun Leuten ist die
   * Selbstbeschreibung keine Verwaltungsangelegenheit. Die Mitgliedschaft
   * prüft der Guard über die `hauskreisId` im Pfad ohnehin.
   *
   * `description: null` löscht, ein fehlendes Feld lässt stehen — Prisma
   * unterscheidet die beiden von sich aus, solange man `undefined` nicht
   * versehentlich zu `null` macht.
   */
  update(id: string, dto: UpdateHauskreisDto, condition?: IfMatchCondition) {
    return updateWithVersionCheck({
      condition,
      update: (versionConstraint) =>
        this.prisma.hauskreis.updateMany({
          where: { id, ...versionConstraint },
          data: {
            name: dto.name,
            description: dto.description,
            version: { increment: 1 },
          },
        }),
      exists: () => this.prisma.hauskreis.findUnique({ where: { id } }),
      reload: () => this.findOne(id),
      notFoundMessage: `Hauskreis ${id} not found`,
    });
  }
}
