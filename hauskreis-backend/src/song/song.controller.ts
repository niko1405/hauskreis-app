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
import { Roles } from '../auth/roles.decorator';
import { ROLE_ADMIN } from '../auth/auth.types';
import { IfMatch } from '../common/http/if-match.decorator';
import type { IfMatchCondition } from '../common/http/etag';

/** The group's growing song database, also the archive view (CLAUDE.md §8). */
@Controller('hauskreise/:hauskreisId/songs')
export class SongController {
  constructor(
    private readonly songs: SongService,
    private readonly people: PersonService,
  ) {}

  @Get()
  findAll(
    @Param() params: HauskreisParamsDto,
    @Query() query: ListSongsQueryDto,
  ) {
    return this.songs.findAll(params.hauskreisId, query);
  }

  @Get(':id')
  findOne(@Param() params: SongParamsDto) {
    return this.songs.findOne(params.hauskreisId, params.id);
  }

  /** Returns the existing song if the group already knows it. */
  @Post()
  async create(
    @Param() params: HauskreisParamsDto,
    @Body() dto: CreateSongDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const person = await this.people.resolveForUser(user);
    return this.songs.createOrReuse(params.hauskreisId, dto, person.id);
  }

  @Patch(':id')
  update(
    @Param() params: SongParamsDto,
    @Body() dto: UpdateSongDto,
    @IfMatch() ifMatch?: IfMatchCondition,
  ) {
    return this.songs.update(params.hauskreisId, params.id, dto, ifMatch);
  }

  @Delete(':id')
  @Roles(ROLE_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param() params: SongParamsDto) {
    return this.songs.remove(params.hauskreisId, params.id);
  }
}
