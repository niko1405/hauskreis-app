import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { NoteService } from './note.service';
import {
  CheckNoteDto,
  CreateNoteDto,
  ListNotesQueryDto,
  NoteParamsDto,
  SetNotePeopleDto,
  UpdateNoteDto,
} from './dto/note.dto';
import { NotePageResponseDto, NoteResponseDto } from './dto/note-response.dto';
import { HauskreisParamsDto } from '../hauskreis/dto/hauskreis.dto';
import { CurrentMembership } from '../auth/current-membership.decorator';
import type { HauskreisMembership } from '../auth/auth.types';
import { IfMatch } from '../common/http/if-match.decorator';
import type { IfMatchCondition } from '../common/http/etag';
import {
  ApiConditionalWrite,
  ApiZodNoContent,
  ApiZodResponse,
} from '../common/http/api-response.decorator';

/**
 * Notizen.
 *
 * Kein `@HauskreisAdmin()` an irgendeiner Route — und auch sonst kein
 * Admin-Weg: Wer eine Notiz sehen darf, entscheidet allein, wer dabei ist
 * (`note-rules.ts`). Alles andere bekommt ein 404.
 */
@Controller('hauskreise/:hauskreisId/notes')
export class NoteController {
  constructor(private readonly notes: NoteService) {}

  @Get()
  @ApiZodResponse(NotePageResponseDto, {
    description: 'Die eigenen und geteilten Notizen, zuletzt geänderte zuerst',
  })
  findAll(
    @Param() params: HauskreisParamsDto,
    @Query() query: ListNotesQueryDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.notes.findAll(params.hauskreisId, query, membership.id);
  }

  @Get(':id')
  @ApiZodResponse(NoteResponseDto)
  findOne(
    @Param() params: NoteParamsDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.notes.findOne(params.hauskreisId, params.id, membership.id);
  }

  @Post()
  @ApiZodResponse(NoteResponseDto, { status: 201 })
  create(
    @Param() params: HauskreisParamsDto,
    @Body() dto: CreateNoteDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.notes.create(params.hauskreisId, dto, membership.id);
  }

  @Patch(':id')
  @ApiZodResponse(NoteResponseDto)
  @ApiConditionalWrite()
  update(
    @Param() params: NoteParamsDto,
    @Body() dto: UpdateNoteDto,
    @CurrentMembership() membership: HauskreisMembership,
    @IfMatch() ifMatch?: IfMatchCondition,
  ) {
    return this.notes.update(
      params.hauskreisId,
      params.id,
      dto,
      membership.id,
      ifMatch,
    );
  }

  /** Wer mitschreibt — nur, wer die Notiz angelegt hat (oder der Notausgang). */
  @Put(':id/people')
  @ApiZodResponse(NoteResponseDto)
  setPeople(
    @Param() params: NoteParamsDto,
    @Body() dto: SetNotePeopleDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.notes.setPeople(
      params.hauskreisId,
      params.id,
      dto,
      membership.id,
    );
  }

  /** Einen Checklistenpunkt abhaken. Ohne `If-Match`, siehe `toggleCheck`. */
  @Post(':id/check')
  @HttpCode(HttpStatus.OK)
  @ApiZodResponse(NoteResponseDto)
  check(
    @Param() params: NoteParamsDto,
    @Body() dto: CheckNoteDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.notes.check(params.hauskreisId, params.id, dto, membership.id);
  }

  @Delete(':id')
  @ApiZodNoContent()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param() params: NoteParamsDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.notes.remove(params.hauskreisId, params.id, membership.id);
  }
}
