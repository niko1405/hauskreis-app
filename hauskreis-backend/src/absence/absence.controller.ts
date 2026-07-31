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
import { AbsenceService, actorFrom } from './absence.service';
import { AbsenceSyncService } from './absence-sync.service';
import { PersonService } from '../person/person.service';
import {
  AbsenceParamsDto,
  CreateAbsenceDto,
  ListAbsencesQueryDto,
  UpdateAbsenceDto,
} from './dto/absence.dto';
import { HauskreisParamsDto } from '../hauskreis/dto/hauskreis.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { ROLE_ADMIN, type AuthenticatedUser } from '../auth/auth.types';
import { Roles } from '../auth/roles.decorator';
import { IfMatch } from '../common/http/if-match.decorator';
import type { IfMatchCondition } from '../common/http/etag';
import {
  ApiConditionalWrite,
  ApiZodNoContent,
  ApiZodResponse,
} from '../common/http/api-response.decorator';
import {
  AbsencePageResponseDto,
  AbsenceResponseDto,
  SyncResultResponseDto,
} from './dto/absence-response.dto';

@Controller('hauskreise/:hauskreisId/absences')
export class AbsenceController {
  constructor(
    private readonly absences: AbsenceService,
    private readonly sync: AbsenceSyncService,
    private readonly people: PersonService,
  ) {}

  /** Everyone's, on purpose — who is away is what planning an evening needs. */
  @Get()
  @ApiZodResponse(AbsencePageResponseDto)
  findAll(
    @Param() params: HauskreisParamsDto,
    @Query() query: ListAbsencesQueryDto,
  ) {
    return this.absences.findAll(params.hauskreisId, query);
  }

  @Get(':id')
  @ApiZodResponse(AbsenceResponseDto)
  findOne(@Param() params: AbsenceParamsDto) {
    return this.absences.findOne(params.hauskreisId, params.id);
  }

  /** Without `personId` this records your own absence. */
  @Post()
  @ApiZodResponse(AbsenceResponseDto, { status: 201 })
  async create(
    @Param() params: HauskreisParamsDto,
    @Body() dto: CreateAbsenceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const person = await this.people.resolveForUser(user);

    return this.absences.create(
      params.hauskreisId,
      dto,
      actorFrom(user, person),
    );
  }

  @Patch(':id')
  @ApiZodResponse(AbsenceResponseDto)
  @ApiConditionalWrite()
  async update(
    @Param() params: AbsenceParamsDto,
    @Body() dto: UpdateAbsenceDto,
    @CurrentUser() user: AuthenticatedUser,
    @IfMatch() ifMatch?: IfMatchCondition,
  ) {
    const person = await this.people.resolveForUser(user);

    return this.absences.update(
      params.hauskreisId,
      params.id,
      dto,
      actorFrom(user, person),
      ifMatch,
    );
  }

  @Delete(':id')
  @ApiZodNoContent()
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param() params: AbsenceParamsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const person = await this.people.resolveForUser(user);

    await this.absences.remove(
      params.hauskreisId,
      params.id,
      actorFrom(user, person),
    );
  }

  /**
   * Manual trigger for the catch-up that also runs after meetings are
   * generated — handy when checking that a long-standing holiday reached a
   * newly created evening.
   */
  @Post('sync')
  @ApiZodResponse(SyncResultResponseDto, {
    description: 'Gleicht die abgeleiteten Absagen an die Zeitraeume an',
  })
  @Roles(ROLE_ADMIN)
  @HttpCode(HttpStatus.OK)
  runSync(@Param() params: HauskreisParamsDto) {
    return this.sync.syncAll(params.hauskreisId);
  }
}
