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
import { CurrentMembership } from '../auth/current-membership.decorator';
import type { HauskreisMembership } from '../auth/auth.types';
import { HauskreisAdmin } from '../auth/hauskreis-admin.decorator';
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
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.absences.create(params.hauskreisId, dto, actorFrom(membership));
  }

  @Patch(':id')
  @ApiZodResponse(AbsenceResponseDto)
  @ApiConditionalWrite()
  async update(
    @Param() params: AbsenceParamsDto,
    @Body() dto: UpdateAbsenceDto,
    @CurrentMembership() membership: HauskreisMembership,
    @IfMatch() ifMatch?: IfMatchCondition,
  ) {
    return this.absences.update(
      params.hauskreisId,
      params.id,
      dto,
      actorFrom(membership),
      ifMatch,
    );
  }

  @Delete(':id')
  @ApiZodNoContent()
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param() params: AbsenceParamsDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    await this.absences.remove(
      params.hauskreisId,
      params.id,
      actorFrom(membership),
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
  @HauskreisAdmin()
  @HttpCode(HttpStatus.OK)
  runSync(@Param() params: HauskreisParamsDto) {
    return this.sync.syncAll(params.hauskreisId);
  }
}
