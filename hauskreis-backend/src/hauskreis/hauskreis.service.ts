import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateHauskreisDto } from './dto/hauskreis.dto';

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
}
