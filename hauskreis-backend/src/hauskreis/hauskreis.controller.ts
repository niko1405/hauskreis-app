import { Body, Controller, Get, Param, Post } from '@nestjs/common';
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
} from './dto/hauskreis.dto';
import { ApiZodResponse } from '../common/http/api-response.decorator';
import {
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
  leave(
    @Param() params: HauskreisParamsDto,
    @Body() dto: LeaveHauskreisDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.memberships.leave(params.hauskreisId, membership.id, dto);
  }
}
