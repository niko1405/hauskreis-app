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
import { TopicCarryOverService } from './topic-carry-over.service';
import { TopicReminderService } from './topic-reminder.service';
import {
  CreateTopicDto,
  ListTopicsQueryDto,
  TopicParamsDto,
  UpdateTopicDto,
} from './dto/topic.dto';
import { HauskreisParamsDto } from '../hauskreis/dto/hauskreis.dto';
import { Roles } from '../auth/roles.decorator';
import { ROLE_ADMIN } from '../auth/auth.types';
import { IfMatch } from '../common/http/if-match.decorator';
import type { IfMatchCondition } from '../common/http/etag';
import {
  ApiConditionalWrite,
  ApiZodNoContent,
  ApiZodResponse,
} from '../common/http/api-response.decorator';
import {
  CarryOverResultResponseDto,
  TopicPageResponseDto,
  TopicResponseDto,
} from './dto/topic-response.dto';
import { ReminderRunResultResponseDto } from '../meeting/dto/meeting-response.dto';

@Controller('hauskreise/:hauskreisId/topics')
export class TopicController {
  constructor(
    private readonly topicService: TopicService,
    private readonly carryOverService: TopicCarryOverService,
    private readonly reminders: TopicReminderService,
  ) {}

  @Get()
  @ApiZodResponse(TopicPageResponseDto)
  findAll(
    @Param() params: HauskreisParamsDto,
    @Query() query: ListTopicsQueryDto,
  ) {
    return this.topicService.findAll(params.hauskreisId, query);
  }

  @Get(':id')
  @ApiZodResponse(TopicResponseDto)
  findOne(@Param() params: TopicParamsDto) {
    return this.topicService.findOne(params.hauskreisId, params.id);
  }

  @Post()
  @ApiZodResponse(TopicResponseDto, { status: 201 })
  create(@Param() params: HauskreisParamsDto, @Body() dto: CreateTopicDto) {
    return this.topicService.create(params.hauskreisId, dto);
  }

  /** Manual trigger for the nightly carry-over, handy for setup and testing. */
  @Post('carry-over')
  @ApiZodResponse(CarryOverResultResponseDto, {
    description: 'Legt das laufende Thema auf die naechsten Termine',
  })
  @Roles(ROLE_ADMIN)
  @HttpCode(HttpStatus.OK)
  carryOver(@Param() params: HauskreisParamsDto) {
    return this.carryOverService.carryOverFor(params.hauskreisId);
  }

  /** Manual trigger for the daily topic reminders, scoped to this group. */
  @Post('reminders')
  @ApiZodResponse(ReminderRunResultResponseDto)
  @Roles(ROLE_ADMIN)
  @HttpCode(HttpStatus.OK)
  runReminders(@Param() params: HauskreisParamsDto) {
    return this.reminders.sendDueReminders({
      hauskreisId: params.hauskreisId,
    });
  }

  /** Also how a topic is marked completed — `{ "status": "COMPLETED" }`. */
  @Patch(':id')
  @ApiZodResponse(TopicResponseDto)
  @ApiConditionalWrite()
  update(
    @Param() params: TopicParamsDto,
    @Body() dto: UpdateTopicDto,
    @IfMatch() ifMatch?: IfMatchCondition,
  ) {
    return this.topicService.update(
      params.hauskreisId,
      params.id,
      dto,
      ifMatch,
    );
  }

  @Delete(':id')
  @ApiZodNoContent()
  @Roles(ROLE_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param() params: TopicParamsDto) {
    return this.topicService.remove(params.hauskreisId, params.id);
  }
}
