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
import { CustomMeetingNotificationService } from './custom-meeting-notification.service';
import { TestimonyReminderService } from './testimony-reminder.service';
import { MeetingScheduleConfigService } from './meeting-schedule-config.service';
import { GroupClockService } from './group-clock.service';
import {
  CancelMeetingDto,
  CreateMeetingDto,
  ListMeetingsQueryDto,
  MeetingParamsDto,
  SetActionstepDoneDto,
  SetAttendanceDto,
  UpdateMeetingDto,
  UpdateMeetingScheduleDto,
} from './dto/meeting.dto';
import { HauskreisParamsDto } from '../hauskreis/dto/hauskreis.dto';
import { HauskreisAdmin } from '../auth/hauskreis-admin.decorator';
import { CurrentMembership } from '../auth/current-membership.decorator';
import type { HauskreisMembership } from '../auth/auth.types';
import { viewerOf } from '../topic/topic-shape';
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
  MeetingScheduleResponseDto,
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
    private readonly customMeetingNotifications: CustomMeetingNotificationService,
    private readonly testimonyReminders: TestimonyReminderService,
    private readonly schedule: MeetingScheduleConfigService,
    private readonly clock: GroupClockService,
  ) {}

  @Get()
  @ApiZodResponse(MeetingPageResponseDto, {
    description: 'Paginiert. `scope=upcoming|past` engt zusätzlich ein.',
  })
  async findAll(
    @Param() params: HauskreisParamsDto,
    @Query() query: ListMeetingsQueryDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.meetingService.findAll(
      params.hauskreisId,
      query,
      viewerOf(membership, await this.clock.zoneOf(params.hauskreisId)),
    );
  }

  /**
   * Wann sich die Gruppe regelmäßig trifft — Wochentag und Uhrzeit.
   *
   * **Muss vor `@Get(':id')` stehen.** Nest nimmt die erste passende Route, und
   * `:id` fängt sonst das Wort „config" ab — es scheiterte dann an der
   * UUID-Prüfung, was nach einem kaputten Termin aussieht und keiner ist.
   *
   * Lesen darf jede:r: dass der Hauskreis dienstags um 18 Uhr ist, muss auf
   * jedem Bildschirm stehen können. Ändern nur Admins.
   */
  @Get('config')
  @ApiZodResponse(MeetingScheduleResponseDto)
  getSchedule(@Param() params: HauskreisParamsDto) {
    return this.schedule.getConfig(params.hauskreisId);
  }

  @Put('config')
  @ApiZodResponse(MeetingScheduleResponseDto, {
    description: 'Gilt fuer neue Termine, nicht rueckwirkend',
  })
  @ApiConditionalWrite()
  @HauskreisAdmin()
  updateSchedule(
    @Param() params: HauskreisParamsDto,
    @Body() dto: UpdateMeetingScheduleDto,
    @CurrentMembership() membership: HauskreisMembership,
    @IfMatch() ifMatch?: IfMatchCondition,
  ) {
    return this.schedule.updateConfig(
      params.hauskreisId,
      dto,
      membership.id,
      ifMatch,
    );
  }

  @Get(':id')
  @ApiZodResponse(MeetingResponseDto)
  async findOne(
    @Param() params: MeetingParamsDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.meetingService.findOne(
      params.hauskreisId,
      params.id,
      viewerOf(membership, await this.clock.zoneOf(params.hauskreisId)),
    );
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

  @Get(':id/testimony-suggestions')
  @ApiZodResponse(RoleSuggestionListResponseDto)
  suggestTestimony(@Param() params: MeetingParamsDto) {
    return this.meetingService.suggestTestimony(params.hauskreisId, params.id);
  }

  @Post()
  @ApiZodResponse(MeetingResponseDto, { status: 201 })
  async create(
    @Param() params: HauskreisParamsDto,
    @Body() dto: CreateMeetingDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    // Wer anlegt, braucht keine Nachricht darüber, dass er angelegt hat.
    return this.meetingService.create(
      params.hauskreisId,
      dto,
      viewerOf(membership, await this.clock.zoneOf(params.hauskreisId)),
    );
  }

  @Patch(':id')
  @ApiZodResponse(MeetingResponseDto)
  @ApiConditionalWrite()
  async update(
    @Param() params: MeetingParamsDto,
    @Body() dto: UpdateMeetingDto,
    @CurrentMembership() membership: HauskreisMembership,
    @IfMatch() ifMatch?: IfMatchCondition,
  ) {
    // Wer einträgt, braucht keine Nachricht darüber, dass er eingetragen hat.
    return this.meetingService.update(
      params.hauskreisId,
      params.id,
      dto,
      viewerOf(membership, await this.clock.zoneOf(params.hauskreisId)),
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
  @HauskreisAdmin()
  @ApiZodResponse(MeetingResponseDto, {
    description: 'Sagt den Abend ab und benachrichtigt die Gruppe',
  })
  @ApiConditionalWrite()
  // Returns the updated meeting rather than creating anything, so 200 not 201.
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param() params: MeetingParamsDto,
    @Body() dto: CancelMeetingDto,
    @CurrentMembership() membership: HauskreisMembership,
    @IfMatch() ifMatch?: IfMatchCondition,
  ) {
    return this.meetingService.cancel(
      params.hauskreisId,
      params.id,
      dto,
      viewerOf(membership, await this.clock.zoneOf(params.hauskreisId)),
      ifMatch,
    );
  }

  /** Nimmt eine Absage zurück — auch eine, die von selbst zustande kam. */
  @Post(':id/uncancel')
  @HauskreisAdmin()
  @ApiZodResponse(MeetingResponseDto, {
    description: 'Der Abend findet doch statt; die Gruppe erfährt es',
  })
  @ApiConditionalWrite()
  @HttpCode(HttpStatus.OK)
  async uncancel(
    @Param() params: MeetingParamsDto,
    @CurrentMembership() membership: HauskreisMembership,
    @IfMatch() ifMatch?: IfMatchCondition,
  ) {
    return this.meetingService.uncancel(
      params.hauskreisId,
      params.id,
      viewerOf(membership, await this.clock.zoneOf(params.hauskreisId)),
      ifMatch,
    );
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
  setActionstepDone(
    @Param() params: MeetingParamsDto,
    @Body() dto: SetActionstepDoneDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.meetingService.setActionstepDone(
      params.hauskreisId,
      params.id,
      membership.id,
      dto.done,
    );
  }

  @Delete(':id')
  @ApiZodNoContent()
  @HauskreisAdmin()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param() params: MeetingParamsDto) {
    return this.meetingService.remove(params.hauskreisId, params.id);
  }

  /** Manual trigger for the scheduled generator, handy for setup and testing. */
  @Post('generate')
  @ApiZodResponse(GenerationResultResponseDto, { status: 201 })
  @HauskreisAdmin()
  generate(@Param() params: HauskreisParamsDto) {
    return this.generator.generateFor(params.hauskreisId);
  }

  /** Manual trigger for the daily host reminders, scoped to this group. */
  @Post('host-reminders')
  @ApiZodResponse(ReminderRunResultResponseDto)
  @HauskreisAdmin()
  @HttpCode(HttpStatus.OK)
  runHostReminders(@Param() params: HauskreisParamsDto) {
    return this.hostReminders.sendDueReminders({
      hauskreisId: params.hauskreisId,
    });
  }

  /** Dasselbe für die Erinnerung an das eigene Testimony. */
  @Post('testimony-reminders')
  @ApiZodResponse(ReminderRunResultResponseDto)
  @HauskreisAdmin()
  @HttpCode(HttpStatus.OK)
  runTestimonyReminders(@Param() params: HauskreisParamsDto) {
    return this.testimonyReminders.sendDueReminders({
      hauskreisId: params.hauskreisId,
    });
  }

  /** Dasselbe für die Erinnerung an besondere Termine. */
  @Post('custom-meeting-reminders')
  @ApiZodResponse(ReminderRunResultResponseDto)
  @HauskreisAdmin()
  @HttpCode(HttpStatus.OK)
  runCustomMeetingReminders(@Param() params: HauskreisParamsDto) {
    return this.customMeetingNotifications.sendDueReminders({
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
  @HauskreisAdmin()
  @HttpCode(HttpStatus.OK)
  runActionstepReminders(@Param() params: HauskreisParamsDto) {
    return this.actionstepReminders.sendDueReminders(params.hauskreisId);
  }
}
