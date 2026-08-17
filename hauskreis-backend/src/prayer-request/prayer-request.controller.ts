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
import { PrayerRequestService } from './prayer-request.service';
import { PersonService } from '../person/person.service';
import {
  PrayerRequestParamsDto,
  UpsertPrayerRequestDto,
} from './dto/prayer-request.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  ApiZodNoContent,
  ApiZodResponse,
} from '../common/http/api-response.decorator';
import {
  PrayerRequestListResponseDto,
  PrayerRequestResponseDto,
} from './dto/prayer-request-response.dto';

/**
 * Gebetsanliegen an einem Abend.
 *
 * **`mine` statt `:personId`**, und das ist der ganze Zugriffsschutz. Eine
 * Route mit fremder Personen-Id müsste jedes Mal prüfen, ob sie zur eigenen
 * passt — eine Prüfung, die man vergessen kann, und genau daraus entstehen
 * IDOR-Löcher. Ohne Id im Pfad gibt es nichts zu verwechseln: Der Server nimmt
 * die Person aus dem Token, und mehr steht gar nicht zur Wahl.
 *
 * Eigener Endpunkt und **nicht** Teil der Termin-Antwort — dieselbe Entscheidung
 * wie bei den Liedern: eigener ETag, damit ein Gebetsanliegen nicht die Version
 * des ganzen Abends bewegt und jede offene Bearbeitung am Termin ungültig macht.
 */
@Controller('hauskreise/:hauskreisId/meetings/:meetingId/prayer-requests')
export class PrayerRequestController {
  constructor(
    private readonly prayerRequests: PrayerRequestService,
    private readonly people: PersonService,
  ) {}

  /** Alle Anliegen dieses Abends — sie sind für die ganze Gruppe da. */
  @Get()
  @ApiZodResponse(PrayerRequestListResponseDto)
  findAll(@Param() params: PrayerRequestParamsDto) {
    return this.prayerRequests.findAll(params.hauskreisId, params.meetingId);
  }

  /** Legt das eigene an oder schreibt es um — genau eines je Person und Abend. */
  @Put('mine')
  @ApiZodResponse(PrayerRequestResponseDto)
  async upsertMine(
    @Param() params: PrayerRequestParamsDto,
    @Body() dto: UpsertPrayerRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const person = await this.people.resolveForUser(user);

    return this.prayerRequests.upsertMine(
      params.hauskreisId,
      params.meetingId,
      dto,
      person.id,
    );
  }

  @Delete('mine')
  @ApiZodNoContent()
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMine(
    @Param() params: PrayerRequestParamsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const person = await this.people.resolveForUser(user);

    return this.prayerRequests.removeMine(
      params.hauskreisId,
      params.meetingId,
      person.id,
    );
  }
}
