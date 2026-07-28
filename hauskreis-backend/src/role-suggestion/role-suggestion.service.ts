import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MeetingStatus } from '../../generated/prisma/enums';
import { rankForRole } from './ranking';
import { rankHomes, type HomeUse, type RankableHome } from './host-ranking';
import {
  AssignmentRole,
  type EligiblePerson,
  type HostSuggestion,
  type RoleAssignmentEvent,
} from './role-assignment.types';

interface Household {
  home: RankableHome;
  residents: EligiblePerson[];
}

/**
 * Turns the assignment history into a ranked list of people for a given job.
 *
 * Fetching lives here (which rows count as history, who is eligible), ordering
 * lives in the pure functions next door. Phase 5 and 6 add a `collect…Events`
 * adapter and an eligibility filter each; `rankForRole` stays as it is.
 */
@Injectable()
export class RoleSuggestionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Who should host on `targetDate`, best fit first.
   *
   * Two stages, because for hosting the person and the place are one decision.
   * Ranking them separately would let the two answers contradict each other:
   *
   * 1. **Which home** is most owed an evening (`rankHomes`). The weight sits on
   *    the home rather than on its residents — hosting costs the household, so
   *    two people sharing a flat share one weight instead of getting one each.
   * 2. **Who in that household** takes it (`rankForRole`, unchanged). For a
   *    single resident that is a formality; for a shared home it is the same
   *    "longest not done it" rule that applies everywhere else.
   *
   * Returns everyone eligible rather than a fixed top 3 — the UI shows the
   * first few and can reveal the rest, and no suggestion is ever binding
   * (CLAUDE.md §4: die App schlägt vor, eingetragen wird von Hand).
   */
  async suggestHosts(
    hauskreisId: string,
    targetDate: Date,
    options: { excludeMeetingId?: string } = {},
  ): Promise<HostSuggestion[]> {
    const [households, uses, events] = await Promise.all([
      this.findHouseholds(hauskreisId),
      this.collectHomeUses(hauskreisId, options.excludeMeetingId),
      this.collectEvents(hauskreisId, options.excludeMeetingId),
    ]);

    const ranked = rankHomes({
      homes: households.map((household) => household.home),
      uses,
      targetDate,
      deferredHomeIds: findDeferredHomes(households, events, targetDate),
    });

    const residentsByHome = new Map(
      households.map((household) => [household.home.id, household.residents]),
    );

    return ranked
      .flatMap((entry) =>
        // Within a household the usual person ranking decides, so a shared home
        // does not always propose the same one of its residents.
        rankForRole({
          people: residentsByHome.get(entry.home.id) ?? [],
          events,
          role: AssignmentRole.HOST,
          targetDate,
        }).map((suggestion) => ({
          personId: suggestion.personId,
          name: suggestion.name,
          facts: {
            ...suggestion.facts,
            deferred: entry.deferred,
            home: {
              locationId: entry.home.id,
              locationName: entry.home.name,
              hostWeight: entry.home.hostWeight,
              ...entry.facts,
            },
          },
        })),
      )
      .map((suggestion, index) => ({ ...suggestion, rank: index + 1 }));
  }

  /**
   * The homes in the rotation, each with the people who could host there.
   *
   * A home without a single eligible resident drops out entirely — that is the
   * one hard filter, and it reflects a lasting state ("niemand wohnt dort mehr",
   * "die Bewohner können generell nicht") rather than a busy evening.
   *
   * Host-less places (Schlosspark) are not part of this at all: they owe the
   * group nothing and are picked by hand when the weather is right.
   */
  private async findHouseholds(hauskreisId: string): Promise<Household[]> {
    const locations = await this.prisma.location.findMany({
      where: { hauskreisId, active: true, requiresHost: true },
      select: {
        id: true,
        name: true,
        hostWeight: true,
        residents: {
          where: { active: true, canHost: true },
          select: { id: true, name: true },
        },
      },
    });

    return locations
      .filter((location) => location.residents.length > 0)
      .map((location) => ({
        home: {
          id: location.id,
          name: location.name,
          hostWeight: location.hostWeight,
        },
        residents: location.residents,
      }));
  }

  /**
   * Where the group actually met, from `meeting.location_id`.
   *
   * Deliberately not derived from `person.location_id`: that only says where
   * someone lives *now*. Going through it would re-attribute every past evening
   * when somebody moves, and the new home would start out looking heavily used.
   */
  private async collectHomeUses(
    hauskreisId: string,
    excludeMeetingId?: string,
  ): Promise<HomeUse[]> {
    const meetings = await this.prisma.meeting.findMany({
      where: {
        hauskreisId,
        status: { not: MeetingStatus.CANCELLED },
        locationId: { not: null },
        ...(excludeMeetingId ? { id: { not: excludeMeetingId } } : {}),
      },
      select: { date: true, locationId: true },
    });

    return meetings.map((meeting) => ({
      locationId: meeting.locationId as string,
      date: meeting.date,
    }));
  }

  /**
   * Every assignment the person ranking should know about, past and future.
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

/**
 * Households where *everyone* already has another job that same evening.
 *
 * Only the evening itself counts, not general busyness — a job three weeks out
 * is load, not a conflict, and load is already the first sort criterion inside
 * `rankForRole`. Keeping it to the exact date is what makes this safe without
 * an arbitrary "look ahead N weeks" window.
 *
 * Nothing can trigger it while HOST is the only role (one host per evening, one
 * meeting per date). It starts doing work in Phase 5, when someone can be down
 * for the topic on the evening they would otherwise host.
 */
function findDeferredHomes(
  households: Household[],
  events: RoleAssignmentEvent[],
  targetDate: Date,
): Set<string> {
  const busy = new Set(
    events
      .filter((event) => event.date.getTime() === targetDate.getTime())
      .map((event) => event.personId),
  );

  return new Set(
    households
      .filter((household) =>
        household.residents.every((resident) => busy.has(resident.id)),
      )
      .map((household) => household.home.id),
  );
}
