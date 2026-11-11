import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
} from '@nestjs/common';
import { InviteLinkService } from './invite-link.service';
import { HauskreisAdmin } from '../auth/hauskreis-admin.decorator';
import { CurrentMembership } from '../auth/current-membership.decorator';
import type { HauskreisMembership } from '../auth/auth.types';
import { HauskreisParamsDto, ReplaceInviteLinkDto } from './dto/hauskreis.dto';
import {
  ApiZodNoContent,
  ApiZodResponse,
} from '../common/http/api-response.decorator';
import { InviteLinkStateResponseDto } from './dto/hauskreis-response.dto';

/**
 * Der Einladungslink in der Verwaltung.
 *
 * Alles hier nur für Admins, auch das Lesen: Der Code ist ein Schlüssel zur
 * Gruppe, und wer ihn weitergeben darf, entscheidet dieselbe Stelle, die auch
 * per E-Mail einlädt.
 */
@Controller('hauskreise/:hauskreisId/invite-link')
@HauskreisAdmin()
export class InviteLinkController {
  constructor(private readonly inviteLinks: InviteLinkService) {}

  @Get()
  @ApiZodResponse(InviteLinkStateResponseDto, {
    description: 'Der aktuelle Link, auch ein abgelaufener — oder keiner',
  })
  get(@Param() params: HauskreisParamsDto) {
    return this.inviteLinks.get(params.hauskreisId);
  }

  /**
   * Ein neuer Link. Gab es schon einen, gilt er ab jetzt nicht mehr — `PUT`,
   * weil es höchstens einen gibt und dieser Aufruf ihn ersetzt.
   */
  @Put()
  @ApiZodResponse(InviteLinkStateResponseDto, {
    description: 'Der neue Link; ein bisheriger ist damit ungültig',
  })
  replace(
    @Param() params: HauskreisParamsDto,
    @Body() dto: ReplaceInviteLinkDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.inviteLinks.replace(
      params.hauskreisId,
      membership.id,
      dto.validDays,
    );
  }

  @Delete()
  @ApiZodNoContent()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param() params: HauskreisParamsDto) {
    return this.inviteLinks.remove(params.hauskreisId);
  }
}
