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
} from '@nestjs/common';
import { MeetingSongService } from './meeting-song.service';
import { PersonService } from '../person/person.service';
import { RoleSuggestionService } from '../role-suggestion/role-suggestion.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AddMeetingSongDto,
  MeetingSongListParamsDto,
  MeetingSongParamsDto,
  ReorderSetlistDto,
  SetSongLeadersDto,
  UpdateMeetingSongDto,
} from './dto/song.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { NotFoundException } from '@nestjs/common';
import {
  ApiZodNoContent,
  ApiZodResponse,
} from '../common/http/api-response.decorator';
import {
  MeetingSongListResponseDto,
  MeetingSongResponseDto,
  SongLeadersResponseDto,
} from './dto/song-response.dto';
import { RoleSuggestionListResponseDto } from '../role-suggestion/dto/suggestion-response.dto';

/**
 * Songs and music duty for one evening.
 *
 * Lives in `SongModule` rather than `MeetingModule` — it is song logic that
 * happens to hang off a meeting, and keeping it here means the meeting module
 * stays unaware of songs entirely.
 */
@Controller('hauskreise/:hauskreisId/meetings/:meetingId')
export class MeetingSongController {
  constructor(
    private readonly meetingSongs: MeetingSongService,
    private readonly people: PersonService,
    private readonly suggestions: RoleSuggestionService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('songs')
  @ApiZodResponse(MeetingSongListResponseDto)
  async findAll(
    @Param() params: MeetingSongListParamsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Wer fragt, für `votedByMe` — die Liste ist sonst für alle dieselbe.
    const person = await this.people.resolveForUser(user);

    return this.meetingSongs.findAll(
      params.hauskreisId,
      params.meetingId,
      person.id,
    );
  }

  /**
   * Die Reihenfolge der Setlist. Vor `songs/:id`, damit `order` nicht als Id
   * gelesen wird — die Params prüfen ohnehin auf eine UUID, aber die
   * Reihenfolge der Routen soll das nicht erst brauchen.
   */
  @Put('songs/order')
  @ApiZodResponse(MeetingSongListResponseDto, {
    description: 'Die ganze Liste, Setlist in neuer Reihenfolge',
  })
  async reorder(
    @Param() params: MeetingSongListParamsDto,
    @Body() dto: ReorderSetlistDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const person = await this.people.resolveForUser(user);

    return this.meetingSongs.reorder(
      params.hauskreisId,
      params.meetingId,
      dto,
      person.id,
    );
  }

  @Put('songs/:id/vote')
  @ApiZodResponse(MeetingSongListResponseDto, {
    description: 'Die ganze Liste, Vorschläge neu nach Stimmen sortiert',
  })
  async vote(
    @Param() params: MeetingSongParamsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const person = await this.people.resolveForUser(user);

    return this.meetingSongs.setVote(
      params.hauskreisId,
      params.meetingId,
      params.id,
      person.id,
      true,
    );
  }

  @Delete('songs/:id/vote')
  @ApiZodResponse(MeetingSongListResponseDto, {
    description: 'Die ganze Liste, Vorschläge neu nach Stimmen sortiert',
  })
  async unvote(
    @Param() params: MeetingSongParamsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const person = await this.people.resolveForUser(user);

    return this.meetingSongs.setVote(
      params.hauskreisId,
      params.meetingId,
      params.id,
      person.id,
      false,
    );
  }

  /** Takes either `{ songId }` or a new song's `{ title, artist?, lyricsUrl? }`. */
  @Post('songs')
  @ApiZodResponse(MeetingSongResponseDto, { status: 201 })
  async add(
    @Param() params: MeetingSongListParamsDto,
    @Body() dto: AddMeetingSongDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const person = await this.people.resolveForUser(user);

    return this.meetingSongs.add(
      params.hauskreisId,
      params.meetingId,
      dto,
      person.id,
    );
  }

  @Patch('songs/:id')
  @ApiZodResponse(MeetingSongResponseDto)
  async setSelected(
    @Param() params: MeetingSongParamsDto,
    @Body() dto: UpdateMeetingSongDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Wer abhakt, entscheidet mit — vor dem Abend jedenfalls. Bis hierher war
    // diese Route die einzige Schreibroute an einem Termin, die gar nicht
    // wissen wollte, wer sie aufruft.
    const person = await this.people.resolveForUser(user);

    return this.meetingSongs.setSelected(
      params.hauskreisId,
      params.meetingId,
      params.id,
      dto,
      person.id,
    );
  }

  @Delete('songs/:id')
  @ApiZodNoContent()
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param() params: MeetingSongParamsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Ein Lied aus der Setlist nimmt nur heraus, wer es hineinstellen darf.
    const person = await this.people.resolveForUser(user);

    return this.meetingSongs.remove(
      params.hauskreisId,
      params.meetingId,
      params.id,
      person.id,
    );
  }

  @Get('song-leaders')
  @ApiZodResponse(SongLeadersResponseDto)
  findLeaders(@Param() params: MeetingSongListParamsDto) {
    return this.meetingSongs.findLeaders(params.hauskreisId, params.meetingId);
  }

  /** Replaces the list; an empty one is valid for an evening without songs. */
  @Put('song-leaders')
  @ApiZodResponse(SongLeadersResponseDto, {
    description: 'Ersetzt die Liste; eine leere ist gueltig',
  })
  async setLeaders(
    @Param() params: MeetingSongListParamsDto,
    @Body() dto: SetSongLeadersDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const person = await this.people.resolveForUser(user);

    return this.meetingSongs.setLeaders(
      params.hauskreisId,
      params.meetingId,
      dto,
      person.id,
    );
  }

  /**
   * Who could look after the music, best fit first — only people who play an
   * instrument, since not everyone does (CLAUDE.md §6).
   */
  @Get('song-leader-suggestions')
  @ApiZodResponse(RoleSuggestionListResponseDto, {
    description: 'Nur Personen, die ein Instrument spielen',
  })
  async suggestLeaders(@Param() params: MeetingSongListParamsDto) {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id: params.meetingId, hauskreisId: params.hauskreisId },
      select: { date: true },
    });

    if (!meeting) {
      throw new NotFoundException(`Meeting ${params.meetingId} not found`);
    }

    return this.suggestions.suggestSongLeaders(
      params.hauskreisId,
      meeting.date,
      { excludeMeetingId: params.meetingId },
    );
  }
}
