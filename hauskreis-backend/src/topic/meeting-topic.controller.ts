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
import { TopicSessionService } from './topic-session.service';
import {
  ChooseTopicSessionDto,
  MeetingTopicParamsDto,
  SetTopicResponsiblesDto,
} from './dto/topic.dto';
import { CurrentMembership } from '../auth/current-membership.decorator';
import type { HauskreisMembership } from '../auth/auth.types';
import {
  ApiZodNoContent,
  ApiZodResponse,
} from '../common/http/api-response.decorator';
import {
  TopicChoicesResponseDto,
  TopicResponsiblesResponseDto,
  TopicSessionResponseDto,
} from './dto/topic-response.dto';
import { viewerOf } from './topic-shape';
import { GroupClockService } from '../meeting/group-clock.service';

/**
 * Die Rolle „Thema" an einem einzelnen Abend.
 *
 * Liegt im `TopicModule` und nicht im `MeetingModule` — wie die Musik im
 * `SongModule`: es ist Themen-Logik, die zufällig an einem Termin hängt. Der
 * Termin selbst weiß davon nichts.
 */
@Controller('hauskreise/:hauskreisId/meetings/:meetingId')
export class MeetingTopicController {
  constructor(
    private readonly sessions: TopicSessionService,
    private readonly clock: GroupClockService,
  ) {}

  @Get('topic-responsibles')
  @ApiZodResponse(TopicResponsiblesResponseDto)
  findResponsibles(@Param() params: MeetingTopicParamsDto) {
    return this.sessions.findResponsibles(params.hauskreisId, params.meetingId);
  }

  /**
   * Ersetzt die Liste; eine leere ist gültig und heißt „noch kein Zuständiger".
   *
   * Steht danach niemand mehr da, der zum gewählten Thema gehört, wird die
   * Einheit vom Abend gelöst und bleibt als Entwurf erhalten — es sei denn, der
   * Abend war schon.
   */
  @Put('topic-responsibles')
  @ApiZodResponse(TopicResponsiblesResponseDto, {
    description: 'Ersetzt die Liste; eine leere ist gueltig',
  })
  setResponsibles(
    @Param() params: MeetingTopicParamsDto,
    @Body() dto: SetTopicResponsiblesDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.sessions.setResponsibles(
      params.hauskreisId,
      params.meetingId,
      dto,
      membership.id,
    );
  }

  /** Was die zugeteilte Person wählen kann — eigene Themen und eigene Entwürfe. */
  @Get('topic-choices')
  @ApiZodResponse(TopicChoicesResponseDto)
  choices(
    @Param() params: MeetingTopicParamsDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.sessions.choices(
      params.hauskreisId,
      params.meetingId,
      membership.id,
    );
  }

  /**
   * Die Wahl treffen: neues Thema, eigenes Thema fortsetzen, oder einen Entwurf
   * wieder aufnehmen. Wer zuerst wählt, wird Owner.
   */
  @Post('topic-session')
  @ApiZodResponse(TopicSessionResponseDto, {
    status: 201,
    description: '409, wenn jemand im selben Moment schneller war',
  })
  async choose(
    @Param() params: MeetingTopicParamsDto,
    @Body() dto: ChooseTopicSessionDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.sessions.choose(
      params.hauskreisId,
      params.meetingId,
      dto,
      viewerOf(membership, await this.clock.zoneOf(params.hauskreisId)),
    );
  }

  /**
   * Nimmt die Auswahl zurück. Die Einheit wird wieder unfertig und behält
   * alles, was schon darin steht. Nur solange der Abend bevorsteht.
   */
  @Delete('topic-session')
  @ApiZodNoContent()
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlink(
    @Param() params: MeetingTopicParamsDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.sessions.unlink(
      params.hauskreisId,
      params.meetingId,
      viewerOf(membership, await this.clock.zoneOf(params.hauskreisId)),
    );
  }
}
