import type {
  AssignmentRole,
  EligiblePerson,
  RoleAssignmentEvent,
  RoleSuggestion,
  SuggestionFacts,
  UpcomingCommitment,
} from './role-assignment.types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * How far ahead a booked job still counts as "hat zu tun".
 *
 * Matches the planning window the meeting generator keeps filled (7 Tuesdays),
 * plus a week of slack — so it is the horizon the group is actually planning
 * within, not a number picked for its own sake. Beyond it nothing is really
 * decided yet.
 *
 * Without a bound, saying yes to an evening three months out would drag someone
 * down every single ranking until then. That punishes exactly the people who
 * plan ahead, and a job that far off makes no evening in between any harder.
 */
export const LOAD_HORIZON_DAYS = 8 * 7;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysBetween(earlier: Date, later: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / MS_PER_DAY);
}

/**
 * Ranks people for one role on one date.
 *
 * Deliberately a pure function over already-fetched data: the ordering is the
 * part worth testing, and it stays testable without a database.
 *
 * The order of the criteria is the whole design:
 *
 * 1. **Wer hat am wenigsten zu tun** — fewest jobs already booked from the
 *    target date onwards, counted across *all* roles. Someone who is down for
 *    the topic that evening should not also be asked to host; that case is
 *    flagged as `thisEvening` so the UI can say so instead of printing a date
 *    the reader has to compare himself.
 * 2. **Wer war am längsten nicht dran** — longest since they last had *this*
 *    role; never had it wins outright. This is the fairness criterion.
 * 3. **Wer war insgesamt am seltensten dran** — breaks ties between two people
 *    who last hosted on the same evening.
 * 4. **Name** — so the same data always yields the same list, rather than
 *    a ranking that reshuffles on every request.
 */
export function rankForRole(params: {
  people: EligiblePerson[];
  events: RoleAssignmentEvent[];
  role: AssignmentRole;
  /** The date the job is for — the reference for "past" and "upcoming". */
  targetDate: Date;
}): RoleSuggestion[] {
  const { people, events, role, targetDate } = params;

  const horizonEnd = targetDate.getTime() + LOAD_HORIZON_DAYS * MS_PER_DAY;

  interface Tally {
    /** Distinct past slots of the ranked role — a multi-part job counts once. */
    doneSlots: Set<string>;
    lastAssignedAt: string | null;
    /** Slot key -> the evening it starts, so a job spanning weeks counts once. */
    upcoming: Map<string, UpcomingCommitment>;
  }

  const tallies = new Map<string, Tally>(
    people.map((person) => [
      person.id,
      { doneSlots: new Set(), lastAssignedAt: null, upcoming: new Map() },
    ]),
  );

  for (const event of events) {
    const tally = tallies.get(event.personId);

    // Events for people outside the eligible set (inactive, cannot host, or
    // from another role's history) are simply not counted.
    if (!tally) {
      continue;
    }

    const key = slotKey(event);

    if (event.date.getTime() >= targetDate.getTime()) {
      if (event.date.getTime() > horizonEnd) {
        continue;
      }

      const existing = tally.upcoming.get(key);
      const date = isoDate(event.date);

      // A topic running over several evenings is one job, dated at the first
      // of them — CLAUDE.md §5: ein mehrteiliges Thema zählt wie ein Slot.
      if (!existing || date < existing.date) {
        tally.upcoming.set(key, {
          role: event.role,
          date,
          // Am Zieltag selbst: der Grund, aus dem diese Person gerade *nicht*
          // auch noch das hier übernehmen sollte. Zwei Termine am selben Tag
          // schließt `assertNoOverlap` aus, das Datum ist also eindeutig.
          thisEvening: event.date.getTime() === targetDate.getTime(),
        });
      }
      continue;
    }

    if (event.role !== role) {
      continue;
    }

    tally.doneSlots.add(key);

    const date = isoDate(event.date);
    if (tally.lastAssignedAt === null || date > tally.lastAssignedAt) {
      tally.lastAssignedAt = date;
    }
  }

  return people
    .map((person) => {
      const tally = tallies.get(person.id) as Tally;
      const lastAssignedAt = tally.lastAssignedAt;

      return {
        person,
        facts: {
          lastAssignedAt,
          daysSinceLastAssignment: lastAssignedAt
            ? daysBetween(
                new Date(`${lastAssignedAt}T00:00:00.000Z`),
                targetDate,
              )
            : null,
          timesAssigned: tally.doneSlots.size,
          upcomingCommitments: [...tally.upcoming.values()].toSorted(
            byDateThenRole,
          ),
        } satisfies SuggestionFacts,
      };
    })
    .toSorted((a, b) => compare(a, b))
    .map((entry, index) => ({
      personId: entry.person.id,
      name: entry.person.name,
      photoUpdatedAt: entry.person.photoUpdatedAt,
      rank: index + 1,
      facts: entry.facts,
    }));
}

/**
 * Identifies one job. Events sharing a key are the same job seen on several
 * evenings — a topic that runs for three weeks, say. Without `slotKey` every
 * event stands alone, which is right for hosting: one evening, one job.
 */
function slotKey(event: RoleAssignmentEvent): string {
  return `${event.role}:${event.slotKey ?? isoDate(event.date)}`;
}

function byDateThenRole(a: UpcomingCommitment, b: UpcomingCommitment): number {
  return a.date === b.date
    ? a.role.localeCompare(b.role)
    : a.date < b.date
      ? -1
      : 1;
}

function compare(
  a: { person: EligiblePerson; facts: SuggestionFacts },
  b: { person: EligiblePerson; facts: SuggestionFacts },
): number {
  const byLoad =
    a.facts.upcomingCommitments.length - b.facts.upcomingCommitments.length;
  if (byLoad !== 0) {
    return byLoad;
  }

  // `null` means never assigned, which outranks any finite gap.
  const aGap = a.facts.daysSinceLastAssignment ?? Number.POSITIVE_INFINITY;
  const bGap = b.facts.daysSinceLastAssignment ?? Number.POSITIVE_INFINITY;
  if (aGap !== bGap) {
    return bGap - aGap;
  }

  const byCount = a.facts.timesAssigned - b.facts.timesAssigned;
  if (byCount !== 0) {
    return byCount;
  }

  return a.person.name.localeCompare(b.person.name);
}
