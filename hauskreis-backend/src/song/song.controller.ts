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
  Query,
} from '@nestjs/common';
import { SongService } from './song.service';
import { SongReminderService } from './song-reminder.service';
import { PersonService } from '../person/person.service';
import {
  CreateSongDto,
  ListSongsQueryDto,
  SongParamsDto,
  UpdateSongDto,
} from './dto/song.dto';
import { HauskreisParamsDto } from '../hauskreis/dto/hauskreis.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { HauskreisAdmin } from '../auth/hauskreis-admin.decorator';
import { IfMatch } from '../common/http/if-match.decorator';
import type { IfMatchCondition } from '../common/http/etag';
import {
  ApiConditionalWrite,
  ApiZodNoContent,
  ApiZodResponse,
} from '../common/http/api-response.decorator';
import { SongPageResponseDto, SongResponseDto } from './dto/song-response.dto';
import { ReminderRunResultResponseDto } from '../meeting/dto/meeting-response.dto';

/** The group's growing song database, also the archive view (CLAUDE.md §8). */
@Controller('hauskreise/:hauskreisId/songs')
export class SongController {
  constructor(
    private readonly songs: SongService,
    private readonly people: PersonService,
    private readonly reminders: SongReminderService,
  ) {}

  /** Manual trigger for the daily song reminders, scoped to this group. */
  @Post('reminders')
  @ApiZodResponse(ReminderRunResultResponseDto)
  @HauskreisAdmin()
  @HttpCode(HttpStatus.OK)
  runReminders(@Param() params: HauskreisParamsDto) {
    return this.reminders.sendDueReminders({
      hauskreisId: params.hauskreisId,
    });
  }

  @Get()
  @ApiZodResponse(SongPageResponseDto, {
    description:
      'Die Lieder-Sammlung, sortierbar nach Titel, Haeufigkeit oder zuletzt gesungen',
  })
  findAll(
    @Param() params: HauskreisParamsDto,
    @Query() query: ListSongsQueryDto,
  ) {
    return this.songs.findAll(params.hauskreisId, query);
  }

  @Get(':id')
  @ApiZodResponse(SongResponseDto)
  findOne(@Param() params: SongParamsDto) {
    return this.songs.findOne(params.hauskreisId, params.id);
  }

  /** Returns the existing song if the group already knows it. */
  @Post()
  @ApiZodResponse(SongResponseDto, { status: 201 })
  async create(
    @Param() params: HauskreisParamsDto,
    @Body() dto: CreateSongDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const person = await this.people.resolveForUser(user);
    return this.songs.createOrReuse(params.hauskreisId, dto, person.id);
  }

  @Patch(':id')
  @ApiZodResponse(SongResponseDto)
  @ApiConditionalWrite()
  update(
    @Param() params: SongParamsDto,
    @Body() dto: UpdateSongDto,
    @IfMatch() ifMatch?: IfMatchCondition,
  ) {
    return this.songs.update(params.hauskreisId, params.id, dto, ifMatch);
  }

  @Delete(':id')
  @ApiZodNoContent()
  @HauskreisAdmin()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param() params: SongParamsDto) {
    return this.songs.remove(params.hauskreisId, params.id);
  }
}
