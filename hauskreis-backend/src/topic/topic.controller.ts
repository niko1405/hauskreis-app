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
import { TopicService } from './topic.service';
import { TopicSessionService } from './topic-session.service';
import { TopicReminderService } from './topic-reminder.service';
import {
  CreateTopicDto,
  CreateTopicSessionDto,
  ListTopicsQueryDto,
  TopicCollaboratorParamsDto,
  TopicParamsDto,
  TopicSessionParamsDto,
  UpdateTopicDto,
  UpdateTopicSessionDto,
} from './dto/topic.dto';
import { HauskreisParamsDto } from '../hauskreis/dto/hauskreis.dto';
import { HauskreisAdmin } from '../auth/hauskreis-admin.decorator';
import { CurrentMembership } from '../auth/current-membership.decorator';
import type { HauskreisMembership } from '../auth/auth.types';
import { IfMatch } from '../common/http/if-match.decorator';
import type { IfMatchCondition } from '../common/http/etag';
import {
  ApiConditionalWrite,
  ApiZodNoContent,
  ApiZodResponse,
} from '../common/http/api-response.decorator';
import {
  TopicPageResponseDto,
  TopicResponseDto,
  TopicSessionResponseDto,
} from './dto/topic-response.dto';
import { ReminderRunResultResponseDto } from '../meeting/dto/meeting-response.dto';
import { viewerOf } from './topic-shape';
import { GroupClockService } from '../meeting/group-clock.service';

@Controller('hauskreise/:hauskreisId')
export class TopicController {
  constructor(
    private readonly topics: TopicService,
    private readonly sessions: TopicSessionService,
    private readonly reminders: TopicReminderService,
    private readonly clock: GroupClockService,
  ) {}

  /**
   * Das Archiv. `scope=public` (Vorgabe) listet Themen, von denen mindestens
   * ein Abend war; `scope=mine` die eigenen, auch die noch nicht gehaltenen.
   */
  @Get('topics')
  @ApiZodResponse(TopicPageResponseDto)
  async findAll(
    @Param() params: HauskreisParamsDto,
    @Query() query: ListTopicsQueryDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.topics.findAll(
      params.hauskreisId,
      query,
      viewerOf(membership, await this.clock.zoneOf(params.hauskreisId)),
    );
  }

  @Get('topics/:id')
  @ApiZodResponse(TopicResponseDto)
  async findOne(
    @Param() params: TopicParamsDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.topics.findOne(
      params.hauskreisId,
      params.id,
      viewerOf(membership, await this.clock.zoneOf(params.hauskreisId)),
    );
  }

  /**
   * Ein Thema anlegen, ohne dass ein Abend dafür feststeht.
   *
   * Wer anlegt, wird Owner. Einheiten kommen danach über
   * `POST …/topics/:id/sessions` dazu — oder indem jemand das Thema an einem
   * Abend fortsetzt.
   */
  @Post('topics')
  @ApiZodResponse(TopicResponseDto, { status: HttpStatus.CREATED })
  async create(
    @Param() params: HauskreisParamsDto,
    @Body() dto: CreateTopicDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.topics.create(
      params.hauskreisId,
      dto,
      viewerOf(membership, await this.clock.zoneOf(params.hauskreisId)),
    );
  }

  /** Von Hand ausgelöste Themen-Erinnerungen, auf diese Gruppe beschränkt. */
  @Post('topics/reminders')
  @ApiZodResponse(ReminderRunResultResponseDto)
  @HauskreisAdmin()
  @HttpCode(HttpStatus.OK)
  runReminders(@Param() params: HauskreisParamsDto) {
    return this.reminders.sendDueReminders({
      hauskreisId: params.hauskreisId,
    });
  }

  /** Auch der Weg zu „abgeschlossen" — `{ "status": "COMPLETED" }`. */
  @Patch('topics/:id')
  @ApiZodResponse(TopicResponseDto)
  @ApiConditionalWrite()
  async update(
    @Param() params: TopicParamsDto,
    @Body() dto: UpdateTopicDto,
    @CurrentMembership() membership: HauskreisMembership,
    @IfMatch() ifMatch?: IfMatchCondition,
  ) {
    return this.topics.update(
      params.hauskreisId,
      params.id,
      dto,
      viewerOf(membership, await this.clock.zoneOf(params.hauskreisId)),
      ifMatch,
    );
  }

  /**
   * Löscht ein Thema samt Einheiten. Kommende Abende verlieren ihre Auswahl und
   * stehen wieder bei „zugeteilt, aber noch nichts gewählt"; die Zuteilung
   * selbst bleibt.
   */
  @Delete('topics/:id')
  @ApiZodNoContent()
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param() params: TopicParamsDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.topics.remove(
      params.hauskreisId,
      params.id,
      viewerOf(membership, await this.clock.zoneOf(params.hauskreisId)),
    );
  }

  /**
   * Nimmt jemandem das Bearbeitungsrecht am Thema. Was die Person gehalten hat,
   * bleibt an den Einheiten stehen — das ist Geschichte, kein Recht.
   */
  @Delete('topics/:id/collaborators/:personId')
  @ApiZodNoContent()
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeCollaborator(
    @Param() params: TopicCollaboratorParamsDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.topics.removeCollaborator(
      params.hauskreisId,
      params.id,
      params.personId,
      viewerOf(membership, await this.clock.zoneOf(params.hauskreisId)),
    );
  }

  /**
   * Eine Einheit anlegen, ohne dass ein Abend dafür feststeht.
   *
   * Der Weg, sein Thema in Ruhe vorzubereiten und den Dienstag später zu suchen.
   * Sie taucht danach beim Wählen unter „Angefangenes" auf.
   */
  @Post('topics/:id/sessions')
  @ApiZodResponse(TopicSessionResponseDto, { status: HttpStatus.CREATED })
  async createSession(
    @Param() params: TopicParamsDto,
    @Body() dto: CreateTopicSessionDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.sessions.createSession(
      params.hauskreisId,
      params.id,
      dto,
      viewerOf(membership, await this.clock.zoneOf(params.hauskreisId)),
    );
  }

  @Get('topic-sessions/:sessionId')
  @ApiZodResponse(TopicSessionResponseDto)
  async findSession(
    @Param() params: TopicSessionParamsDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.sessions.findSession(
      params.hauskreisId,
      params.sessionId,
      viewerOf(membership, await this.clock.zoneOf(params.hauskreisId)),
    );
  }

  /** Titel, Actionstep und Zusammenfassung eines einzelnen Abends. */
  @Patch('topic-sessions/:sessionId')
  @ApiZodResponse(TopicSessionResponseDto)
  @ApiConditionalWrite()
  async updateSession(
    @Param() params: TopicSessionParamsDto,
    @Body() dto: UpdateTopicSessionDto,
    @CurrentMembership() membership: HauskreisMembership,
    @IfMatch() ifMatch?: IfMatchCondition,
  ) {
    return this.sessions.updateSession(
      params.hauskreisId,
      params.sessionId,
      dto,
      viewerOf(membership, await this.clock.zoneOf(params.hauskreisId)),
      ifMatch,
    );
  }

  /**
   * Löscht eine einzelne Einheit — nur, solange sie noch nicht gehalten wurde.
   * Ein Abend, der war, geht nur mit dem ganzen Thema.
   */
  @Delete('topic-sessions/:sessionId')
  @ApiZodNoContent()
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeSession(
    @Param() params: TopicSessionParamsDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.sessions.removeSession(
      params.hauskreisId,
      params.sessionId,
      viewerOf(membership, await this.clock.zoneOf(params.hauskreisId)),
    );
  }
}
