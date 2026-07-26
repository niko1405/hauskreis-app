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

@Controller('hauskreise/:hauskreisId/meetings')
export class MeetingController {
  constructor(
    private readonly meetingService: MeetingService,
    private readonly generator: MeetingGeneratorService,
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

  @Post()
  create(@Param() params: HauskreisParamsDto, @Body() dto: CreateMeetingDto) {
    return this.meetingService.create(params.hauskreisId, dto);
  }

  @Patch(':id')
  update(@Param() params: MeetingParamsDto, @Body() dto: UpdateMeetingDto) {
    return this.meetingService.update(params.hauskreisId, params.id, dto);
  }

  /** Cancelling keeps the meeting visible; use DELETE to remove it entirely. */
  @Post(':id/cancel')
  cancel(@Param() params: MeetingParamsDto) {
    return this.meetingService.cancel(params.hauskreisId, params.id);
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
}
