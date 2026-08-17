import { Controller, Get } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ApiZodResponse } from '../common/http/api-response.decorator';
import { RELEASES } from './releases';

/**
 * Was in „Neu in Acts2" steht.
 *
 * Nicht Hauskreis-bezogen: Die App ist für alle dieselbe. Deshalb hängt die
 * Route nicht unter `/hauskreise/:id/…`, sondern für sich.
 */
const releaseSchema = z.object({
  version: z.string(),
  /// Nur der Tag, ohne Uhrzeit — ein Erscheinungsdatum hat keine.
  date: z.string(),
  title: z.string(),
  highlights: z.array(z.string()),
});

class ReleaseListResponseDto extends createZodDto(z.array(releaseSchema)) {}

@Controller('releases')
export class ReleaseController {
  /**
   * Die Liste kommt aus dem Programm, nicht aus der Datenbank
   * (`releases.ts`) — sie ändert sich nur mit einem Deploy, und ein Eintrag
   * ist Quelltext, den jemand geschrieben hat.
   *
   * Nicht `@Public()`: Was neu ist, geht die Gruppe etwas an und niemanden
   * sonst.
   */
  @Get()
  @ApiZodResponse(ReleaseListResponseDto, {
    description: 'Alle Releases, neueste zuerst',
  })
  findAll() {
    return RELEASES;
  }
}
