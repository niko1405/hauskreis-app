import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateHauskreisDto } from './dto/hauskreis.dto';

@Injectable()
export class HauskreisService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.hauskreis.findMany({ orderBy: { name: 'asc' } });
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
