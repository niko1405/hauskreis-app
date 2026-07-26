import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateLocationDto, UpdateLocationDto } from './dto/location.dto';

@Injectable()
export class LocationService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(hauskreisId: string) {
    return this.prisma.location.findMany({
      where: { hauskreisId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(hauskreisId: string, id: string) {
    const location = await this.prisma.location.findFirst({
      where: { id, hauskreisId },
    });

    if (!location) {
      throw new NotFoundException(`Location ${id} not found`);
    }

    return location;
  }

  create(hauskreisId: string, dto: CreateLocationDto) {
    return this.prisma.location.create({
      data: {
        hauskreisId,
        name: dto.name,
        frequencyFactor: dto.frequencyFactor,
        requiresHost: dto.requiresHost,
      },
    });
  }

  async update(hauskreisId: string, id: string, dto: UpdateLocationDto) {
    await this.findOne(hauskreisId, id);

    return this.prisma.location.update({
      where: { id },
      data: {
        name: dto.name,
        frequencyFactor: dto.frequencyFactor,
        requiresHost: dto.requiresHost,
        active: dto.active,
      },
    });
  }

  async remove(hauskreisId: string, id: string) {
    await this.findOne(hauskreisId, id);
    await this.prisma.location.delete({ where: { id } });
  }
}
