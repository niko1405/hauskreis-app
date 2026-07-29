import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceStatus, MeetingStatus } from '../../generated/prisma/enums';
import { rankForRole } from './ranking';
import { rankHomes, type HomeUse, type RankableHome } from './host-ranking';
import {
  AssignmentRole,
  type EligiblePerson,
  type HostSuggestion,
  type RoleAssignmentEvent,
  type RoleSuggestion,
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
    const [households, uses, events, expectedAttendance] = await Promise.all([
      this.findHouseholds(hauskreisId),
      this.collectHomeUses(hauskreisId, options.excludeMeetingId),
      this.collectEvents(hauskreisId, options.excludeMeetingId),
      this.countExpectedAttendance(hauskreisId, options.excludeMeetingId),
    ]);

    const ranked = rankHomes({
      homes: households.map((household) => household.home),
      uses,
      targetDate,
      expectedAttendance,
      busyHomeIds: findBusyHomes(households, events, targetDate),
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
            deferredReason: entry.deferredReason,
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
   * Who should prepare the next topic, best fit first.
   *
   * No location involved, so this goes straight through `rankForRole` — the
   * same function and the same four criteria as inside a household. Proof that
   * the shared engine carries: the only new parts are the event adapter below
   * and the eligibility filter here (everyone active).
   */
  async suggestTopicResponsibles(
    hauskreisId: string,
    targetDate: Date,
    options: { excludeTopicId?: string } = {},
  ): Promise<RoleSuggestion[]> {
    const [people, hostEvents, topicEvents] = await Promise.all([
      this.prisma.person.findMany({
        where: { hauskreisId, active: true },
        select: { id: true, name: true },
      }),
      this.collectEvents(hauskreisId),
      this.collectTopicEvents(hauskreisId, options.excludeTopicId),
    ]);

    return rankForRole({
      people,
      // Hosting comes along for the ride: it does not count towards "wann warst
      // du zuletzt mit dem Thema dran", but it does count as load.
      events: [...hostEvents, ...topicEvents],
      role: AssignmentRole.TOPIC,
      targetDate,
    });
  }

  /**
   * Who should look after the music, best fit first.
   *
   * The only difference to the topic ranking is the eligibility filter: not
   * everyone plays an instrument (CLAUDE.md §6). Four people do, so the pool is
   * small and the "wer war am längsten nicht dran" criterion carries most of
   * the weight.
   *
   * Note this is a *suggestion* filter, not a rule — `setLeaders` still accepts
   * whoever the group agreed on.
   */
  async suggestSongLeaders(
    hauskreisId: string,
    targetDate: Date,
    options: { excludeMeetingId?: string } = {},
  ): Promise<RoleSuggestion[]> {
    const [people, hostEvents, topicEvents, songEvents] = await Promise.all([
      this.prisma.person.findMany({
        where: { hauskreisId, active: true, playsInstrument: true },
        select: { id: true, name: true },
      }),
      this.collectEvents(hauskreisId),
      this.collectTopicEvents(hauskreisId),
      this.collectSongEvents(hauskreisId, options.excludeMeetingId),
    ]);

    return rankForRole({
      people,
      events: [...hostEvents, ...topicEvents, ...songEvents],
      role: AssignmentRole.SONG,
      targetDate,
    });
  }

  /**
   * Homes that are only an option for this meeting *because* people dropped
   * out — too small for the full group, big enough for the ones still coming.
   *
   * The trigger for telling their residents "bei euch wäre jetzt Platz". Says
   * nothing about whether that is the fairest choice: the ranking answers that
   * when somebody opens the picker. This is an invitation, not a decision.
   */
  async findHomesUnlockedByAbsences(
    hauskreisId: string,
    meetingId: string,
  ): Promise<Household[]> {
    const [households, expected, fullGroup] = await Promise.all([
      this.findHouseholds(hauskreisId),
      this.countExpectedAttendance(hauskreisId, meetingId),
      this.prisma.person.count({ where: { hauskreisId, active: true } }),
    ]);

    if (expected === null) {
      return [];
    }

    return households.filter(
      ({ home }) =>
        home.capacity !== null &&
        // Would not have fit the whole group…
        home.capacity < fullGroup &&
        // …but fits the people who are actually coming.
        home.capacity >= expected,
    );
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
        capacity: true,
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
          capacity: location.capacity,
        },
        residents: location.residents,
      }));
  }

  /**
   * How many people to expect, for the homes that have a size limit.
   *
   * Everyone active counts unless they have said they are not coming. An
   * undecided answer counts as coming: the mistake worth avoiding is picking a
   * home that turns out too small on the night, not the other way round.
   *
   * Right now only explicit per-meeting answers reduce the number, so far-off
   * evenings look full and the tight homes stay set aside until people actually
   * decline. The absence periods from Phase 9 will feed in here too, which is
   * what makes a holiday declared weeks ahead count at planning time.
   */
  private async countExpectedAttendance(
    hauskreisId: string,
    meetingId?: string,
  ): Promise<number | null> {
    if (!meetingId) {
      return null;
    }

    const [active, declined] = await Promise.all([
      this.prisma.person.count({ where: { hauskreisId, active: true } }),
      this.prisma.meetingAttendance.count({
        where: {
          meetingId,
          status: AttendanceStatus.ABSENT,
          person: { hauskreisId, active: true },
        },
      }),
    ]);

    return active - declined;
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

  /**
   * Topic assignments, one event per (person, evening the topic is on).
   *
   * They all carry the topic id as `slotKey`, which is what collapses a topic
   * running over three evenings into a single slot — CLAUDE.md §5. The
   * per-evening granularity still matters: only that tells whether someone is
   * busy on the exact evening being planned.
   */
  private async collectTopicEvents(
    hauskreisId: string,
    excludeTopicId?: string,
  ): Promise<RoleAssignmentEvent[]> {
    const meetings = await this.prisma.meeting.findMany({
      where: {
        hauskreisId,
        status: { not: MeetingStatus.CANCELLED },
        topicId: { not: null },
        ...(excludeTopicId ? { NOT: { topicId: excludeTopicId } } : {}),
      },
      select: {
        date: true,
        topicId: true,
        topic: { select: { responsibles: { select: { personId: true } } } },
      },
    });

    return meetings.flatMap((meeting) =>
      (meeting.topic?.responsibles ?? []).map((responsible) => ({
        personId: responsible.personId,
        role: AssignmentRole.TOPIC,
        date: meeting.date,
        slotKey: meeting.topicId as string,
      })),
    );
  }

  /**
   * Music duty, one event per (person, evening). No `slotKey`: songs are picked
   * per evening, so one evening is one job — unlike a topic.
   */
  private async collectSongEvents(
    hauskreisId: string,
    excludeMeetingId?: string,
  ): Promise<RoleAssignmentEvent[]> {
    const leaders = await this.prisma.meetingSongLeader.findMany({
      where: {
        meeting: {
          hauskreisId,
          status: { not: MeetingStatus.CANCELLED },
          ...(excludeMeetingId ? { id: { not: excludeMeetingId } } : {}),
        },
      },
      select: { personId: true, meeting: { select: { date: true } } },
    });

    return leaders.map((leader) => ({
      personId: leader.personId,
      role: AssignmentRole.SONG,
      date: leader.meeting.date,
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
function findBusyHomes(
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
