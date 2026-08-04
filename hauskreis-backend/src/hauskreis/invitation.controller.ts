import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { MembershipService } from './membership.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { InvitationParamsDto, LeaveHauskreisDto } from './dto/hauskreis.dto';
import { ApiZodResponse } from '../common/http/api-response.decorator';
import { InvitationListResponseDto } from './dto/hauskreis-response.dto';
import { MeResponseDto } from '../person/dto/person-response.dto';

/**
 * Einladungen in andere Hauskreise.
 *
 * Liegt unter `/api/me`, gehört aber ins Hauskreis-Modul: sonst müssten sich
 * `PersonModule` und `HauskreisModule` gegenseitig importieren. Ein zweiter
 * Controller mit demselben Präfix ist der billigere Preis als eine
 * Ringabhängigkeit.
 */
@Controller('me/invitations')
export class InvitationController {
  constructor(private readonly memberships: MembershipService) {}

  /**
   * Beantwortbar auch dann, wenn es noch gar keine Person gibt — beim
   * allerersten Öffnen ist das der einzige Weg hinein.
   */
  @Get()
  @ApiZodResponse(InvitationListResponseDto, {
    description: 'Was andere Hauskreise dir angeboten haben',
  })
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.memberships.invitations(user);
  }

  /**
   * Nimmt eine Einladung an — und verlässt dabei den bisherigen Hauskreis.
   *
   * Ausdrücklich ein eigener Schritt und kein Nebeneffekt des Anmeldens: dass
   * eine Einladung die bestehende Mitgliedschaft beendet, ist genau die
   * Überraschung, vor der man gefragt werden will. Ist man dort die einzige
   * Admin-Person, gehört `successorPersonId` dazu.
   */
  @Post(':personId/accept')
  @ApiZodResponse(MeResponseDto, {
    description: 'Die neue Mitgliedschaft; die alte ist damit beendet',
  })
  @HttpCode(HttpStatus.OK)
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: InvitationParamsDto,
    @Body() dto: LeaveHauskreisDto,
  ) {
    return this.memberships.acceptInvitation(user, params.personId, dto);
  }
}
