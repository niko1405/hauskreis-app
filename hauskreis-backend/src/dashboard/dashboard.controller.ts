import { Controller, Get, Param, Query } from '@nestjs/common';
import { AssignmentService } from './assignment.service';
import { DashboardService } from './dashboard.service';
import { PersonService } from '../person/person.service';
import { ListAssignmentsQueryDto } from './dto/assignment.dto';
import { HauskreisParamsDto } from '../hauskreis/dto/hauskreis.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

@Controller('hauskreise/:hauskreisId')
export class DashboardController {
  constructor(
    private readonly assignments: AssignmentService,
    private readonly dashboard: DashboardService,
    private readonly people: PersonService,
  ) {}

  /**
   * Who is down for what, over a stretch of time.
   *
   * Without `personId` this is the multi-week planning table (CLAUDE.md §9);
   * with it, one person's badges. One route for both, so the two views cannot
   * end up disagreeing about who is on for an evening.
   */
  @Get('assignments')
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
  async home(
    @Param() params: HauskreisParamsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const person = await this.people.resolveForUser(user);

    return this.dashboard.build(params.hauskreisId, person.id);
  }
}
