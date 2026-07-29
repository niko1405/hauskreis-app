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
  CreateMeetingDto,
  ListMeetingsQueryDto,
  MeetingParamsDto,
  SetAttendanceDto,
  UpdateMeetingDto,
} from './dto/meeting.dto';
import { HauskreisParamsDto } from '../hauskreis/dto/hauskreis.dto';
import { Roles } from '../auth/roles.decorator';
import { ROLE_ADMIN } from '../auth/auth.types';
import { IfMatch } from '../common/http/if-match.decorator';
import type { IfMatchCondition } from '../common/http/etag';

@Controller('hauskreise/:hauskreisId/meetings')
export class MeetingController {
  constructor(
    private readonly meetingService: MeetingService,
    private readonly generator: MeetingGeneratorService,
    private readonly hostReminders: HostReminderService,
    private readonly actionstepReminders: ActionstepReminderService,
  ) {}

  @Get()
  findAll(
    @Param() params: HauskreisParamsDto,
    @Query() query: ListMeetingsQueryDto,
  ) {
    return this.meetingService.findAll(params.hauskreisId, query);
  }

  @Get(':id')
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
  suggestHosts(@Param() params: MeetingParamsDto) {
    return this.meetingService.suggestHosts(params.hauskreisId, params.id);
  }

  @Get(':id/topic-suggestions')
  suggestTopicResponsibles(@Param() params: MeetingParamsDto) {
    return this.meetingService.suggestTopicResponsibles(
      params.hauskreisId,
      params.id,
    );
  }

  @Post()
  create(@Param() params: HauskreisParamsDto, @Body() dto: CreateMeetingDto) {
    return this.meetingService.create(params.hauskreisId, dto);
  }

  @Patch(':id')
  update(
    @Param() params: MeetingParamsDto,
    @Body() dto: UpdateMeetingDto,
    @IfMatch() ifMatch?: IfMatchCondition,
  ) {
    return this.meetingService.update(
      params.hauskreisId,
      params.id,
      dto,
      ifMatch,
    );
  }

  /** Cancelling keeps the meeting visible; use DELETE to remove it entirely. */
  @Post(':id/cancel')
  // Returns the updated meeting rather than creating anything, so 200 not 201.
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param() params: MeetingParamsDto,
    @IfMatch() ifMatch?: IfMatchCondition,
  ) {
    return this.meetingService.cancel(params.hauskreisId, params.id, ifMatch);
  }

  @Put(':id/attendance')
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

  @Delete(':id')
  @Roles(ROLE_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param() params: MeetingParamsDto) {
    return this.meetingService.remove(params.hauskreisId, params.id);
  }

  /** Manual trigger for the scheduled generator, handy for setup and testing. */
  @Post('generate')
  @Roles(ROLE_ADMIN)
  generate(@Param() params: HauskreisParamsDto) {
    return this.generator.generateFor(params.hauskreisId);
  }

  /** Manual trigger for the daily host reminders, scoped to this group. */
  @Post('host-reminders')
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
  @Roles(ROLE_ADMIN)
  @HttpCode(HttpStatus.OK)
  runActionstepReminders(@Param() params: HauskreisParamsDto) {
    return this.actionstepReminders.sendDueReminders(params.hauskreisId);
  }
}
