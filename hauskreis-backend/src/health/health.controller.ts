import { Controller, Get } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/public.decorator';
import { ApiZodResponse } from '../common/http/api-response.decorator';

/** Beides `ok`/`up`, oder die Route antwortet gar nicht erst mit 200. */
class HealthResponseDto extends createZodDto(
  z.object({ status: z.string(), database: z.string() }),
) {}

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiZodResponse(HealthResponseDto, {
    description: 'Prüft zugleich, ob die Datenbank antwortet',
  })
  async check(): Promise<{ status: string; database: string }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', database: 'up' };
  }
}
