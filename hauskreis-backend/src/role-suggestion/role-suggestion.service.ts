import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MeetingStatus } from '../../generated/prisma/enums';
import { rankForRole } from './ranking';
import {
  AssignmentRole,
  type EligiblePerson,
  type RoleAssignmentEvent,
  type RoleSuggestion,
} from './role-assignment.types';

/**
 * Turns the assignment history into a ranked list of people for a given job.
 *
 * The split is intentional: this service does the *fetching* (which rows count
 * as history, who is eligible), `rankForRole` does the *ordering*. Phase 5 and 6
 * add a `collect…Events` adapter and an eligibility filter each; the ranking
 * itself stays as it is.
 */
@Injectable()
export class RoleSuggestionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Who should host on `targetDate`, best fit first.
   *
   * Returns everyone eligible rather than a fixed top 3 — the UI shows the
   * first few and can reveal the rest, and no suggestion is ever binding
   * (CLAUDE.md §4: die App schlägt vor, eingetragen wird von Hand).
   */
  async suggestHosts(
    hauskreisId: string,
    targetDate: Date,
    options: { excludeMeetingId?: string } = {},
  ): Promise<RoleSuggestion[]> {
    const [people, events] = await Promise.all([
      this.findEligibleHosts(hauskreisId),
      this.collectEvents(hauskreisId, options.excludeMeetingId),
    ]);

    return rankForRole({
      people,
      events,
      role: AssignmentRole.HOST,
      targetDate,
    });
  }

  /**
   * People who can take a hosting slot at all.
   *
   * `canHost` is the personal setting ("ich kann gerade generell nicht
   * hosten"); `active` excludes former members. Absences come in Phase 9 as an
   * additional filter here — nothing else needs to change for that.
   */
  private findEligibleHosts(hauskreisId: string): Promise<EligiblePerson[]> {
    return this.prisma.person.findMany({
      where: { hauskreisId, active: true, canHost: true },
      select: { id: true, name: true },
    });
  }

  /**
   * Every assignment the ranking should know about, past and future.
   *
   * Cancelled meetings are left out on purpose: an evening that never happened
   * should not count as "du warst doch gerade erst dran".
   */
  private async collectEvents(
    hauskreisId: string,
    excludeMeetingId?: string,
  ): Promise<RoleAssignmentEvent[]> {
    const meetings = await this.prisma.meeting.findMany({
      where: {
        hauskreisId,
        status: { not: MeetingStatus.CANCELLED },
        hostPersonId: { not: null },
        ...(excludeMeetingId ? { id: { not: excludeMeetingId } } : {}),
      },
      select: { date: true, hostPersonId: true },
    });

    return meetings.map((meeting) => ({
      personId: meeting.hostPersonId as string,
      role: AssignmentRole.HOST,
      date: meeting.date,
    }));
  }
}
