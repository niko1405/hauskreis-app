import type {
  AssignmentRole,
  EligiblePerson,
  RoleAssignmentEvent,
  RoleSuggestion,
  SuggestionFacts,
  UpcomingCommitment,
} from './role-assignment.types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
 *    the topic that evening should not also be asked to host.
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

  const facts = new Map<string, SuggestionFacts>(
    people.map((person) => [
      person.id,
      {
        lastAssignedAt: null,
        daysSinceLastAssignment: null,
        timesAssigned: 0,
        upcomingCommitments: [],
      },
    ]),
  );

  for (const event of events) {
    const personFacts = facts.get(event.personId);

    // Events for people outside the eligible set (inactive, cannot host, or
    // from another role's history) are simply not counted.
    if (!personFacts) {
      continue;
    }

    if (event.date.getTime() >= targetDate.getTime()) {
      personFacts.upcomingCommitments.push({
        role: event.role,
        date: isoDate(event.date),
      });
      continue;
    }

    if (event.role !== role) {
      continue;
    }

    personFacts.timesAssigned += 1;

    const isMoreRecent =
      personFacts.lastAssignedAt === null ||
      isoDate(event.date) > personFacts.lastAssignedAt;

    if (isMoreRecent) {
      personFacts.lastAssignedAt = isoDate(event.date);
      personFacts.daysSinceLastAssignment = daysBetween(event.date, targetDate);
    }
  }

  for (const personFacts of facts.values()) {
    personFacts.upcomingCommitments.sort(byDateThenRole);
  }

  return people
    .map((person) => ({
      person,
      facts: facts.get(person.id) as SuggestionFacts,
    }))
    .toSorted((a, b) => compare(a, b))
    .map((entry, index) => ({
      personId: entry.person.id,
      name: entry.person.name,
      rank: index + 1,
      facts: entry.facts,
    }));
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
