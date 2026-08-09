import { Controller, Get, Param, Query } from '@nestjs/common';
import { AssignmentService } from './assignment.service';
import { DashboardService } from './dashboard.service';
import { ListAssignmentsQueryDto } from './dto/assignment.dto';
import { HauskreisParamsDto } from '../hauskreis/dto/hauskreis.dto';
import { CurrentMembership } from '../auth/current-membership.decorator';
import type { HauskreisMembership } from '../auth/auth.types';
import { viewerOf } from '../topic/topic-shape';
import { ApiZodResponse } from '../common/http/api-response.decorator';
import {
  AssignmentListResponseDto,
  HomeScreenResponseDto,
} from './dto/dashboard-response.dto';

@Controller('hauskreise/:hauskreisId')
export class DashboardController {
  constructor(
    private readonly assignments: AssignmentService,
    private readonly dashboard: DashboardService,
  ) {}

  /**
   * Who is down for what, over a stretch of time.
   *
   * Without `personId` this is the multi-week planning table (CLAUDE.md §9);
   * with it, one person's badges. One route for both, so the two views cannot
   * end up disagreeing about who is on for an evening.
   */
  @Get('assignments')
  @ApiZodResponse(AssignmentListResponseDto, {
    description:
      'Ohne personId die Mehrwochen-Tabelle, mit ihr die eigenen Badges',
  })
  async findAssignments(
    @Param() params: HauskreisParamsDto,
    @Query() query: ListAssignmentsQueryDto,
  ) {
    const items = await this.assignments.findAssignments(params.hauskreisId, {
      from: query.from,
      to: query.to,
      personId: query.personId,
    });

    // No pagination envelope: the range cap already bounds this, and a home
    // screen paging through its own badges would be absurd.
    return { items };
  }

  /** Everything the home screen shows, in one request. */
  @Get('home')
  @ApiZodResponse(HomeScreenResponseDto, {
    description: 'Der ganze Home-Screen in einem Aufruf',
  })
  home(
    @Param() params: HauskreisParamsDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.dashboard.build(params.hauskreisId, viewerOf(membership));
  }
}
