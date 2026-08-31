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
} from '@nestjs/common';
import { HauskreisService } from './hauskreis.service';
import { MembershipService } from './membership.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { CurrentMembership } from '../auth/current-membership.decorator';
import type {
  AuthenticatedUser,
  HauskreisMembership,
} from '../auth/auth.types';
import {
  CreateHauskreisDto,
  HauskreisParamsDto,
  LeaveHauskreisDto,
  UpdateHauskreisDto,
} from './dto/hauskreis.dto';
import { IfMatch } from '../common/http/if-match.decorator';
import type { IfMatchCondition } from '../common/http/etag';
import {
  ApiConditionalWrite,
  ApiZodResponse,
} from '../common/http/api-response.decorator';
import {
  AccountDeletedResponseDto,
  HauskreisListResponseDto,
  HauskreisResponseDto,
  LeaveResultResponseDto,
} from './dto/hauskreis-response.dto';

@Controller('hauskreise')
export class HauskreisController {
  constructor(
    private readonly hauskreisService: HauskreisService,
    private readonly memberships: MembershipService,
  ) {}

  @Get()
  @ApiZodResponse(HauskreisListResponseDto, {
    description: 'Nur die eigenen — praktisch genau einer',
  })
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.hauskreisService.findMine(user.keycloakUserId);
  }

  @Get(':hauskreisId')
  @ApiZodResponse(HauskreisResponseDto)
  findOne(@Param() params: HauskreisParamsDto) {
    return this.hauskreisService.findOne(params.hauskreisId);
  }

  /**
   * Name und Beschreibung — wer ihr seid.
   *
   * **Ohne `@HauskreisAdmin()`**, aus demselben Grund wie beim Kopfbild: Bei
   * neun Leuten ist die Selbstbeschreibung keine Verwaltungsangelegenheit.
   * Anders als der Termin-Rhythmus oder die Geschenke-Regeln ändert sie nichts
   * daran, wie die App rechnet.
   */
  @Patch(':hauskreisId')
  @ApiZodResponse(HauskreisResponseDto)
  @ApiConditionalWrite()
  update(
    @Param() params: HauskreisParamsDto,
    @Body() dto: UpdateHauskreisDto,
    @IfMatch() ifMatch?: IfMatchCondition,
  ) {
    return this.hauskreisService.update(params.hauskreisId, dto, ifMatch);
  }

  /**
   * Gründet einen Hauskreis; die gründende Person wird Admin.
   *
   * Vorher entstand hier eine leere Gruppe, die niemand betreten konnte. Wer
   * schon in einem Hauskreis ist, bekommt einen `409` — ein Wechsel ist ein
   * Umzug und kein stilles Nebeneinander.
   */
  @Post()
  @ApiZodResponse(HauskreisResponseDto, {
    status: 201,
    description: 'Legt den Hauskreis an und macht dich dort zum Admin',
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateHauskreisDto,
  ) {
    return this.memberships.create(user, dto);
  }

  /**
   * Verlässt den Hauskreis.
   *
   * Wer als einzige Admin-Person geht, benennt eine Nachfolge
   * (`successorPersonId`); ohne sie ist das ein `400`, das die Auswahl
   * anfordert. Wer als letzte Person geht, nimmt den Hauskreis mit.
   */
  @Post(':hauskreisId/leave')
  @ApiZodResponse(LeaveResultResponseDto, {
    description: 'Die Zeile bleibt fürs Archiv, die Mitgliedschaft endet',
  })
  // Es entsteht nichts, es endet etwas — also 200 und nicht 201.
  @HttpCode(HttpStatus.OK)
  leave(
    @Param() params: HauskreisParamsDto,
    @Body() dto: LeaveHauskreisDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.memberships.leave(params.hauskreisId, membership.id, dto);
  }

  /**
   * Löscht das Konto: derselbe Austritt, danach Name, Adresse und Geburtstag
   * weg und das Keycloak-Konto dazu.
   *
   * Die Zeile bleibt trotzdem stehen — anonym. Löschte man sie, verlöre jeder
   * vergangene Abend seinen Gastgeber und jede Einheit ihre Gehalten-von-Zeile
   * (siehe `MembershipService.deleteAccount`).
   *
   * Dieselbe Nachfolgeregelung wie beim Austritt: wer als einzige Admin-Person
   * geht, benennt jemanden.
   */
  @Delete(':hauskreisId/account')
  @ApiZodResponse(AccountDeletedResponseDto, {
    description: 'Die Zeile bleibt fürs Archiv, ohne die Person darin',
  })
  @HttpCode(HttpStatus.OK)
  deleteAccount(
    @Param() params: HauskreisParamsDto,
    @Body() dto: LeaveHauskreisDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.memberships.deleteAccount(
      params.hauskreisId,
      membership.id,
      dto,
    );
  }
}
