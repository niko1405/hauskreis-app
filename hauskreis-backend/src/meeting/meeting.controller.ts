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
  Put,
  Query,
} from '@nestjs/common';
import { MeetingService } from './meeting.service';
import { MeetingGeneratorService } from './meeting-generator.service';
import { HostReminderService } from './host-reminder.service';
import { ActionstepReminderService } from './actionstep-reminder.service';
import {
  CancelMeetingDto,
  CreateMeetingDto,
  ListMeetingsQueryDto,
  MeetingParamsDto,
  SetActionstepDoneDto,
  SetAttendanceDto,
  UpdateMeetingDto,
} from './dto/meeting.dto';
import { HauskreisParamsDto } from '../hauskreis/dto/hauskreis.dto';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ROLE_ADMIN, type AuthenticatedUser } from '../auth/auth.types';
import { PersonService } from '../person/person.service';
import { IfMatch } from '../common/http/if-match.decorator';
import type { IfMatchCondition } from '../common/http/etag';
import {
  ApiConditionalWrite,
  ApiZodNoContent,
  ApiZodResponse,
} from '../common/http/api-response.decorator';
import {
  ActionstepDoneResponseDto,
  ActionstepRunResultResponseDto,
  AttendanceResponseDto,
  GenerationResultResponseDto,
  MeetingPageResponseDto,
  MeetingResponseDto,
  ReminderRunResultResponseDto,
} from './dto/meeting-response.dto';
import {
  HostSuggestionListResponseDto,
  RoleSuggestionListResponseDto,
} from '../role-suggestion/dto/suggestion-response.dto';

@Controller('hauskreise/:hauskreisId/meetings')
export class MeetingController {
  constructor(
    private readonly meetingService: MeetingService,
    private readonly generator: MeetingGeneratorService,
    private readonly hostReminders: HostReminderService,
    private readonly actionstepReminders: ActionstepReminderService,
    private readonly people: PersonService,
  ) {}

  @Get()
  @ApiZodResponse(MeetingPageResponseDto, {
    description: 'Paginiert. `scope=upcoming|past` engt zusätzlich ein.',
  })
  findAll(
    @Param() params: HauskreisParamsDto,
    @Query() query: ListMeetingsQueryDto,
  ) {
    return this.meetingService.findAll(params.hauskreisId, query);
  }

  @Get(':id')
  @ApiZodResponse(MeetingResponseDto)
  findOne(@Param() params: MeetingParamsDto) {
    return this.meetingService.findOne(params.hauskreisId, params.id);
  }

  /**
   * Ranked hosting suggestions — person *and* home together, with the facts
   * behind them.
   *
   * Read-only and non-binding: assigning still happens through `PATCH :id`
   * with `hostPersonId` and `locationId`, exactly as if it had been picked by
   * hand. Meeting somewhere without a host (Schlosspark) is not part of this
   * ranking at all — those places are a plain choice from `…/locations`.
   */
  @Get(':id/host-suggestions')
  @ApiZodResponse(HostSuggestionListResponseDto, {
    description: 'Beste Passung zuerst, mit den Fakten dahinter',
  })
  suggestHosts(@Param() params: MeetingParamsDto) {
    return this.meetingService.suggestHosts(params.hauskreisId, params.id);
  }

  @Get(':id/topic-suggestions')
  @ApiZodResponse(RoleSuggestionListResponseDto)
  suggestTopicResponsibles(@Param() params: MeetingParamsDto) {
    return this.meetingService.suggestTopicResponsibles(
      params.hauskreisId,
      params.id,
    );
  }

  @Post()
  @ApiZodResponse(MeetingResponseDto, { status: 201 })
  create(@Param() params: HauskreisParamsDto, @Body() dto: CreateMeetingDto) {
    return this.meetingService.create(params.hauskreisId, dto);
  }

  @Patch(':id')
  @ApiZodResponse(MeetingResponseDto)
  @ApiConditionalWrite()
  async update(
    @Param() params: MeetingParamsDto,
    @Body() dto: UpdateMeetingDto,
    @CurrentUser() user: AuthenticatedUser,
    @IfMatch() ifMatch?: IfMatchCondition,
  ) {
    // Wer einträgt, braucht keine Nachricht darüber, dass er eingetragen hat.
    const person = await this.people.resolveForUser(user);

    return this.meetingService.update(
      params.hauskreisId,
      params.id,
      dto,
      person.id,
      ifMatch,
    );
  }

  /**
   * Sagt den **ganzen** Abend ab; der Termin bleibt sichtbar, `DELETE` löscht
   * ihn wirklich.
   *
   * Nur Admins. Die eigene Teilnahme abzusagen ist etwas anderes und geht über
   * `PUT :id/attendance` — vorher stand hier für jedes Mitglied ein roter Knopf,
   * der den Abend für alle absagte.
   */
  @Post(':id/cancel')
  @Roles(ROLE_ADMIN)
  @ApiZodResponse(MeetingResponseDto, {
    description: 'Sagt den Abend ab und benachrichtigt die Gruppe',
  })
  @ApiConditionalWrite()
  // Returns the updated meeting rather than creating anything, so 200 not 201.
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param() params: MeetingParamsDto,
    @Body() dto: CancelMeetingDto,
    @CurrentUser() user: AuthenticatedUser,
    @IfMatch() ifMatch?: IfMatchCondition,
  ) {
    const person = await this.people.resolveForUser(user);

    return this.meetingService.cancel(
      params.hauskreisId,
      params.id,
      dto,
      person.id,
      ifMatch,
    );
  }

  /** Nimmt eine Absage zurück — auch eine, die von selbst zustande kam. */
  @Post(':id/uncancel')
  @Roles(ROLE_ADMIN)
  @ApiZodResponse(MeetingResponseDto, {
    description: 'Der Abend findet doch statt; die Gruppe erfährt es',
  })
  @ApiConditionalWrite()
  @HttpCode(HttpStatus.OK)
  uncancel(
    @Param() params: MeetingParamsDto,
    @IfMatch() ifMatch?: IfMatchCondition,
  ) {
    return this.meetingService.uncancel(params.hauskreisId, params.id, ifMatch);
  }

  @Put(':id/attendance')
  @ApiZodResponse(AttendanceResponseDto)
  setAttendance(
    @Param() params: MeetingParamsDto,
    @Body() dto: SetAttendanceDto,
  ) {
    return this.meetingService.setAttendance(
      params.hauskreisId,
      params.id,
      dto,
    );
  }

  /**
   * Hakt den Actionstep dieses Abends für einen selbst ab.
   *
   * Kein `personId` im Body und kein `If-Match`: einen Vorsatz hakt man für
   * sich ab, nicht füreinander, und es ist ein Schalter, kein Wettlauf.
   */
  @Put(':id/actionstep-done')
  @ApiZodResponse(ActionstepDoneResponseDto, {
    description: 'Ohne If-Match — ein Schalter, kein Wettlauf',
  })
  async setActionstepDone(
    @Param() params: MeetingParamsDto,
    @Body() dto: SetActionstepDoneDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const person = await this.people.resolveForUser(user);

    return this.meetingService.setActionstepDone(
      params.hauskreisId,
      params.id,
      person.id,
      dto.done,
    );
  }

  @Delete(':id')
  @ApiZodNoContent()
  @Roles(ROLE_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param() params: MeetingParamsDto) {
    return this.meetingService.remove(params.hauskreisId, params.id);
  }

  /** Manual trigger for the scheduled generator, handy for setup and testing. */
  @Post('generate')
  @ApiZodResponse(GenerationResultResponseDto, { status: 201 })
  @Roles(ROLE_ADMIN)
  generate(@Param() params: HauskreisParamsDto) {
    return this.generator.generateFor(params.hauskreisId);
  }

  /** Manual trigger for the daily host reminders, scoped to this group. */
  @Post('host-reminders')
  @ApiZodResponse(ReminderRunResultResponseDto)
  @Roles(ROLE_ADMIN)
  @HttpCode(HttpStatus.OK)
  runHostReminders(@Param() params: HauskreisParamsDto) {
    return this.hostReminders.sendDueReminders({
      hauskreisId: params.hauskreisId,
    });
  }

  /**
   * Manual trigger for the actionstep nudge.
   *
   * Still respects each person's chosen weekday, so off-day this reports zero
   * rather than surprising the group — the button exists to check the job, not
   * to bypass the setting.
   */
  @Post('actionstep-reminders')
  @ApiZodResponse(ActionstepRunResultResponseDto)
  @Roles(ROLE_ADMIN)
  @HttpCode(HttpStatus.OK)
  runActionstepReminders(@Param() params: HauskreisParamsDto) {
    return this.actionstepReminders.sendDueReminders(params.hauskreisId);
  }
}
