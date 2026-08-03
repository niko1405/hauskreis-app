import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { PrayerBuddyService } from './prayer-buddy.service';
import { PrayerBuddyGeneratorService } from './prayer-buddy-generator.service';
import { PersonService } from '../person/person.service';
import {
  ListPrayerBuddiesQueryDto,
  RotateDto,
  UpdateCycleConfigDto,
} from './dto/prayer-buddy.dto';
import { HauskreisParamsDto } from '../hauskreis/dto/hauskreis.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { ROLE_ADMIN, type AuthenticatedUser } from '../auth/auth.types';
import { Roles } from '../auth/roles.decorator';
import { IfMatch } from '../common/http/if-match.decorator';
import type { IfMatchCondition } from '../common/http/etag';
import {
  ApiConditionalWrite,
  ApiZodResponse,
} from '../common/http/api-response.decorator';
import {
  CurrentPrayerBuddyResponseDto,
  PlanningResultResponseDto,
  PrayerBuddyConfigResponseDto,
  PrayerBuddyPageResponseDto,
  RotationResultResponseDto,
} from './dto/prayer-buddy-response.dto';

@Controller('hauskreise/:hauskreisId/prayer-buddies')
export class PrayerBuddyController {
  constructor(
    private readonly buddies: PrayerBuddyService,
    private readonly generator: PrayerBuddyGeneratorService,
    private readonly people: PersonService,
  ) {}

  /** Who is praying with whom right now. `null` when nobody is assigned. */
  @Get('current')
  @ApiZodResponse(CurrentPrayerBuddyResponseDto, {
    description: 'null, wenn fuer heute niemand zugeteilt ist',
  })
  findCurrent(@Param() params: HauskreisParamsDto) {
    return this.buddies.findCurrent(params.hauskreisId);
  }

  @Get()
  @ApiZodResponse(PrayerBuddyPageResponseDto)
  findAll(
    @Param() params: HauskreisParamsDto,
    @Query() query: ListPrayerBuddiesQueryDto,
  ) {
    return this.buddies.findAll(params.hauskreisId, query);
  }

  @Get('config')
  @ApiZodResponse(PrayerBuddyConfigResponseDto)
  getConfig(@Param() params: HauskreisParamsDto) {
    return this.buddies.getConfig(params.hauskreisId);
  }

  /**
   * Changes the rotation rhythm. Applies from the **next** rotation — the
   * running assignment keeps its dates, so nobody's current buddies change
   * under them just because the setting moved.
   */
  @Put('config')
  @ApiZodResponse(PrayerBuddyConfigResponseDto, {
    description: 'Gilt ab der naechsten Rotation, nicht rueckwirkend',
  })
  @ApiConditionalWrite()
  @Roles(ROLE_ADMIN)
  async updateConfig(
    @Param() params: HauskreisParamsDto,
    @Body() dto: UpdateCycleConfigDto,
    @CurrentUser() user: AuthenticatedUser,
    @IfMatch() ifMatch?: IfMatchCondition,
  ) {
    const person = await this.people.resolveForUser(user);

    return this.buddies.updateConfig(
      params.hauskreisId,
      dto,
      person.id,
      ifMatch,
    );
  }

  /**
   * Rotates immediately, even mid-period. The running round is closed off (or
   * discarded, if it only started today), the next planned one is pulled
   * forward to start today, and the tail is topped back up.
   */
  @Post('rotate')
  @ApiZodResponse(RotationResultResponseDto)
  @Roles(ROLE_ADMIN)
  @HttpCode(HttpStatus.OK)
  rotate(@Param() params: HauskreisParamsDto, @Body() dto: RotateDto) {
    return this.generator.rotateNow(params.hauskreisId, {
      notify: dto.notify,
    });
  }

  /**
   * Manual trigger for the scheduled planner, handy for setup and testing —
   * the same idea as `POST …/meetings/generate`.
   *
   * Announces nothing: a round is announced when it begins.
   */
  @Post('plan')
  @ApiZodResponse(PlanningResultResponseDto, { status: 201 })
  @Roles(ROLE_ADMIN)
  plan(@Param() params: HauskreisParamsDto) {
    return this.generator.ensureRoundsPlanned(params.hauskreisId);
  }
}
