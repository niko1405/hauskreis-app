import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { BirthdayService } from './birthday.service';
import { BirthdayConfigService } from './birthday-config.service';
import { BirthdayPlannerService } from './birthday-planner.service';
import { HauskreisParamsDto } from '../hauskreis/dto/hauskreis.dto';
import {
  BirthdayParamsDto,
  CreateGiftIdeaDto,
  DecideGiftDto,
  GiftIdeaParamsDto,
  UpdateBirthdayGiftConfigDto,
  UpdateGiftPairingsDto,
} from './dto/birthday.dto';
import {
  BirthdayDetailResponseDto,
  BirthdayGiftConfigResponseDto,
  BirthdayOverviewResponseDto,
  GiftIdeaListResponseDto,
  GiftPairingListResponseDto,
} from './dto/birthday-response.dto';
import { CurrentMembership } from '../auth/current-membership.decorator';
import type { HauskreisMembership } from '../auth/auth.types';
import { HauskreisAdmin } from '../auth/hauskreis-admin.decorator';
import { IfMatch } from '../common/http/if-match.decorator';
import type { IfMatchCondition } from '../common/http/etag';
import {
  ApiConditionalWrite,
  ApiZodResponse,
} from '../common/http/api-response.decorator';

/**
 * Geburtstage und die Geschenke dazu.
 *
 * **Keine Personen-Id in irgendeinem Pfad.** Wer fragt, kommt aus dem Token
 * (`@CurrentMembership()`), und daran hängt die Regel, die dieses Modul trägt:
 * Wer Geburtstag hat, bekommt zu seiner eigenen Runde nichts geschickt. Stünde
 * die Kennung im Pfad, wäre die Überraschung eine Zeichenkette weit weg.
 *
 * `config` und `pairings` stehen **vor** `:id` — sonst nähme Nest sie als
 * Kennung und antwortete mit einem Validierungsfehler. Derselbe Hinweis steht
 * schon an `meeting.controller.ts`.
 */
@Controller('hauskreise/:hauskreisId/birthdays')
export class BirthdayController {
  constructor(
    private readonly birthdays: BirthdayService,
    private readonly config: BirthdayConfigService,
    private readonly planner: BirthdayPlannerService,
  ) {}

  /** Alle Mitglieder, die kommenden Geburtstage und die eigenen Rollen. */
  @Get()
  @ApiZodResponse(BirthdayOverviewResponseDto)
  findAll(
    @Param() params: HauskreisParamsDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.birthdays.overview(params.hauskreisId, membership.id);
  }

  @Get('config')
  @ApiZodResponse(BirthdayGiftConfigResponseDto)
  getConfig(@Param() params: HauskreisParamsDto) {
    return this.config.get(params.hauskreisId);
  }

  /**
   * Die Einstellungen ändern.
   *
   * Danach wird sofort neu geplant: Wer „ab jetzt rotierend" sagt, meint die
   * kommenden Geburtstage und nicht die des nächsten Jahres. Was in der Frist
   * liegt, bleibt trotzdem stehen — das entscheidet der Planer, nicht diese
   * Route.
   */
  @Put('config')
  @HauskreisAdmin()
  @ApiConditionalWrite()
  @ApiZodResponse(BirthdayGiftConfigResponseDto)
  async updateConfig(
    @Param() params: HauskreisParamsDto,
    @Body() dto: UpdateBirthdayGiftConfigDto,
    @CurrentMembership() membership: HauskreisMembership,
    @IfMatch() ifMatch?: IfMatchCondition,
  ) {
    const updated = await this.config.update(
      params.hauskreisId,
      dto,
      membership.id,
      ifMatch,
    );

    await this.planner.plan(params.hauskreisId);

    return updated;
  }

  @Get('pairings')
  @HauskreisAdmin()
  @ApiZodResponse(GiftPairingListResponseDto)
  listPairings(@Param() params: HauskreisParamsDto) {
    return this.config.listPairings(params.hauskreisId);
  }

  @Put('pairings')
  @HauskreisAdmin()
  @ApiZodResponse(GiftPairingListResponseDto)
  async setPairings(
    @Param() params: HauskreisParamsDto,
    @Body() dto: UpdateGiftPairingsDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    const result = await this.config.setPairings(
      params.hauskreisId,
      dto,
      membership.id,
    );

    await this.planner.plan(params.hauskreisId);

    return result;
  }

  @Get(':id')
  @ApiZodResponse(BirthdayDetailResponseDto)
  findOne(
    @Param() params: BirthdayParamsDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.birthdays.detail(params.hauskreisId, params.id, membership.id);
  }

  /** Auswählen und den Preis eintragen — beides nur für den Zuständigen. */
  @Put(':id/gift')
  @ApiZodResponse(BirthdayDetailResponseDto)
  decide(
    @Param() params: BirthdayParamsDto,
    @Body() dto: DecideGiftDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.birthdays.decide(
      params.hauskreisId,
      params.id,
      dto,
      membership.id,
    );
  }

  @Post(':id/ideas')
  @ApiZodResponse(GiftIdeaListResponseDto, { status: 201 })
  propose(
    @Param() params: BirthdayParamsDto,
    @Body() dto: CreateGiftIdeaDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.birthdays.proposeIdea(
      params.hauskreisId,
      params.id,
      dto,
      membership.id,
    );
  }

  @Delete(':id/ideas/:ideaId')
  @ApiZodResponse(GiftIdeaListResponseDto)
  @HttpCode(HttpStatus.OK)
  remove(
    @Param() params: GiftIdeaParamsDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.birthdays.removeIdea(
      params.hauskreisId,
      params.id,
      params.ideaId,
      membership.id,
    );
  }

  @Put(':id/ideas/:ideaId/vote')
  @ApiZodResponse(GiftIdeaListResponseDto)
  approve(
    @Param() params: GiftIdeaParamsDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.birthdays.vote(
      params.hauskreisId,
      params.id,
      params.ideaId,
      membership.id,
      true,
    );
  }

  @Delete(':id/ideas/:ideaId/vote')
  @ApiZodResponse(GiftIdeaListResponseDto)
  @HttpCode(HttpStatus.OK)
  withdraw(
    @Param() params: GiftIdeaParamsDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.birthdays.vote(
      params.hauskreisId,
      params.id,
      params.ideaId,
      membership.id,
      false,
    );
  }
}
