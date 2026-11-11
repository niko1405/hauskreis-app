import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InviteLinkService } from './invite-link.service';
import { MembershipService } from './membership.service';
import { Public } from '../auth/public.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { JoinViaLinkDto, ResolveInviteLinkDto } from './dto/hauskreis.dto';
import { ApiZodResponse } from '../common/http/api-response.decorator';
import { ResolvedInviteLinkResponseDto } from './dto/hauskreis-response.dto';
import { MeResponseDto } from '../person/dto/person-response.dto';

/**
 * Die andere Seite des Einladungslinks: wer ihn geöffnet hat.
 *
 * Beide Routen nehmen den Code im **Rumpf** und tragen eine eigene Drossel. Der
 * Code ist ein Schlüssel zur Gruppe; im Pfad stünde er in jedem
 * Zugriffsprotokoll, und ohne Drossel ließe sich an `resolve` beliebig oft
 * raten. Mit 128 Bit ist Raten aussichtslos — die Drossel sorgt dafür, dass es
 * auch billig aussichtslos bleibt.
 */
@Controller('invite-links')
export class JoinController {
  constructor(
    private readonly inviteLinks: InviteLinkService,
    private readonly memberships: MembershipService,
  ) {}

  /**
   * Wohin der Link führt — **ohne Anmeldung**.
   *
   * Wer ihn öffnet, hat oft noch gar kein Konto, und „wofür lege ich das
   * gerade an?" ist die erste Frage, die eine Seite beantworten muss. Verraten
   * wird nur der Name, und den kennt ohnehin, wer den Link bekommen hat.
   */
  @Post('resolve')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiZodResponse(ResolvedInviteLinkResponseDto, {
    description: 'Der Hauskreis hinter dem Link; 404, wenn er nicht mehr gilt',
  })
  resolve(@Body() dto: ResolveInviteLinkDto) {
    return this.inviteLinks.resolve(dto.code);
  }

  /**
   * Beitreten — als Mitglied.
   *
   * Wer noch in einem anderen Hauskreis ist, verlässt ihn dabei, und zwar nur
   * mit `switchConfirmed`; ohne kommt `409` mit `code: SWITCH_NOT_CONFIRMED`.
   * Wer dort die einzige Admin-Person ist, benennt eine Nachfolge
   * (`successorPersonId`), sonst `400` wie beim Verlassen.
   */
  @Post('join')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiZodResponse(MeResponseDto, {
    description:
      'Die neue Mitgliedschaft; eine bisherige ist damit beendet. Schon dabei: unverändert',
  })
  join(@CurrentUser() user: AuthenticatedUser, @Body() dto: JoinViaLinkDto) {
    return this.memberships.joinViaLink(user, dto);
  }
}
