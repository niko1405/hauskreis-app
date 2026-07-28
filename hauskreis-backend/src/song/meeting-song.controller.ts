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
  SetSongLeadersDto,
  UpdateMeetingSongDto,
} from './dto/song.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { NotFoundException } from '@nestjs/common';

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
  findAll(@Param() params: MeetingSongListParamsDto) {
    return this.meetingSongs.findAll(params.hauskreisId, params.meetingId);
  }

  /** Takes either `{ songId }` or a new song's `{ title, artist?, lyricsUrl? }`. */
  @Post('songs')
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
  setSelected(
    @Param() params: MeetingSongParamsDto,
    @Body() dto: UpdateMeetingSongDto,
  ) {
    return this.meetingSongs.setSelected(
      params.hauskreisId,
      params.meetingId,
      params.id,
      dto,
    );
  }

  @Delete('songs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param() params: MeetingSongParamsDto) {
    return this.meetingSongs.remove(
      params.hauskreisId,
      params.meetingId,
      params.id,
    );
  }

  @Get('song-leaders')
  findLeaders(@Param() params: MeetingSongListParamsDto) {
    return this.meetingSongs.findLeaders(params.hauskreisId, params.meetingId);
  }

  /** Replaces the list; an empty one is valid for an evening without songs. */
  @Put('song-leaders')
  setLeaders(
    @Param() params: MeetingSongListParamsDto,
    @Body() dto: SetSongLeadersDto,
  ) {
    return this.meetingSongs.setLeaders(
      params.hauskreisId,
      params.meetingId,
      dto,
    );
  }

  /**
   * Who could look after the music, best fit first — only people who play an
   * instrument, since not everyone does (CLAUDE.md §6).
   */
  @Get('song-leader-suggestions')
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
