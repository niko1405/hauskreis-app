import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SongLookupService } from './song-lookup.service';
import {
  LyricsLinkSearchDto,
  MetadataFromLinkDto,
} from './dto/song-lookup.dto';
import {
  LyricsLinkCandidatesResponseDto,
  SongLookupStatusResponseDto,
  SongMetadataResponseDto,
} from './dto/song-lookup-response.dto';
import { ApiZodResponse } from '../common/http/api-response.decorator';

/**
 * Die beiden Abkürzungen beim Lied-Anlegen (CLAUDE.md §6).
 *
 * Beide laufen auf Knopfdruck, nicht bei jedem getippten Buchstaben — jeder
 * Aufruf kostet Geld und dauert Sekunden. Deshalb `POST` und nicht `GET`: es
 * ist eine angestoßene Handlung, kein Abruf, und nichts davon gehört in einen
 * Cache.
 *
 * Beide Routen bekommen eine eigene Drossel. Das globale Budget (300/min)
 * schützt den Server vor Überlastung; hier geht es um etwas anderes, nämlich um
 * eine fremde Rechnung.
 */
@Controller('hauskreise/:hauskreisId/songs/lookup')
export class SongLookupController {
  constructor(private readonly lookup: SongLookupService) {}

  /** Ohne API-Schlüssel blendet das Frontend die Knöpfe aus. */
  @Get('status')
  @ApiZodResponse(SongLookupStatusResponseDto, {
    description: 'Ob ein Gemini-Schluessel hinterlegt ist',
  })
  status() {
    return { enabled: this.lookup.isEnabled };
  }

  @Post('from-link')
  @ApiZodResponse(SongMetadataResponseDto, {
    description:
      'Titel und Interpret von der verlinkten Seite; beide null, wenn dort nichts Eindeutiges steht',
  })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  fromLink(@Body() dto: MetadataFromLinkDto) {
    return this.lookup.metadataFromLink(dto.url);
  }

  @Post('link-suggestions')
  @ApiZodResponse(LyricsLinkCandidatesResponseDto, {
    description:
      'Geprueft erreichbare Links, bevorzugte Seiten zuerst; leer heisst nichts gefunden. Mit more=true kommen die bisherigen plus neue dazu.',
  })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async linkSuggestions(@Body() dto: LyricsLinkSearchDto) {
    return {
      candidates: await this.lookup.search(
        dto.title,
        dto.artist ?? undefined,
        dto.more,
      ),
    };
  }
}
