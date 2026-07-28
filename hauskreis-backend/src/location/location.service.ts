import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { updateWithVersionCheck } from '../common/http/optimistic-update';
import type { IfMatchCondition } from '../common/http/etag';
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
        hostWeight: dto.hostWeight,
        capacity: dto.capacity ?? null,
        requiresHost: dto.requiresHost,
      },
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

  async remove(hauskreisId: string, id: string) {
    await this.findOne(hauskreisId, id);
    await this.prisma.location.delete({ where: { id } });
  }
}
