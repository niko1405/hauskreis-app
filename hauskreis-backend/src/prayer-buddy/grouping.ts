export interface GroupablePerson {
  id: string;
  name: string;
}

/** One past assignment: who was together, and when. */
export interface PastGrouping {
  /** Ordinal of the period; higher is more recent. */
  periodIndex: number;
  memberIds: string[];
}

export interface BuddyGroup {
  members: GroupablePerson[];
  /**
   * Periods since the least-stale pairing inside this group. `null` when no two
   * of them have ever been together — the ideal case.
   */
  lastTogetherPeriodsAgo: number | null;
}

/**
 * Splits the group into prayer buddies for one period.
 *
 * Deliberately *not* part of the role suggestion engine: that one answers "one
 * person per slot", this is a pairing problem with a different shape entirely
 * (Architektur-Prinzip 4).
 *
 * **Sizes.** Pairs, plus a single trio when the count is odd — nine people
 * become 2/2/2/3 rather than 3/3/3. Two is the format the group actually wants;
 * the trio only exists because the number does not divide.
 *
 * **Repeat avoidance.** Every pairing carries a penalty of `1 / periods since
 * they were last together`, and never-paired costs nothing. The split with the
 * lowest total wins, found exactly by a search over subsets — nine people means
 * at most 256 states, so there is no reason to approximate.
 *
 * Taking the best pair first and working down looks equivalent and is not: it
 * strands whoever is left at the end with each other, however recently they
 * were together. In a trial run that put the same two people together in three
 * consecutive periods.
 *
 * The penalty falls away steeply rather than linearly, which is what stops the
 * search buying a "one period ago" pairing to make three others slightly
 * staler: at 1/x, one repeat straight after costs as much as four pairings four
 * periods old.
 *
 * **Fair trios.** Who ends up in the trio is decided *first*, and it is
 * whoever has been in one least often. Left to the greedy pass it would be
 * whoever happens to remain, and the same person could land there repeatedly.
 *
 * Deterministic throughout: ties break on name, so the same history always
 * produces the same grouping instead of a list that reshuffles on retry.
 */
export function buildGroups(params: {
  people: GroupablePerson[];
  history: PastGrouping[];
  /** Ordinal of the period being filled; must be above every past one. */
  periodIndex: number;
}): BuddyGroup[] {
  const { people, history, periodIndex } = params;

  if (people.length < 2) {
    // A single person has nobody to be paired with; an empty group would be
    // worse than none at all.
    return [];
  }

  const lastTogether = buildPairHistory(history);
  const trioCount = countTrioMemberships(history);

  const staleness = (a: string, b: string): number => {
    const last = lastTogether.get(pairKey(a, b));
    return last === undefined ? Number.POSITIVE_INFINITY : periodIndex - last;
  };

  const remaining = [...people].toSorted((a, b) =>
    a.name.localeCompare(b.name),
  );

  // Odd count: settle the trio's third member up front, so it is the person
  // who has been in a trio least often rather than whoever is left over.
  let thirdWheel: GroupablePerson | null = null;
  if (remaining.length % 2 === 1) {
    thirdWheel = remaining.reduce((best, person) =>
      (trioCount.get(person.id) ?? 0) < (trioCount.get(best.id) ?? 0)
        ? person
        : best,
    );
    remaining.splice(remaining.indexOf(thirdWheel), 1);
  }

  const penalty = (a: string, b: string): number => {
    const gap = staleness(a, b);
    return Number.isFinite(gap) ? 1 / gap : 0;
  };

  const pairs = matchOptimally(remaining, penalty);

  if (thirdWheel) {
    const host = pickTrioHost(pairs, thirdWheel, penalty);
    host.push(thirdWheel);
  }

  return pairs.map((members) => ({
    members,
    lastTogetherPeriodsAgo: leastStale(members, staleness),
  }));
}

/**
 * Splits an even-sized list into pairs with the lowest total penalty.
 *
 * A search over subsets: always match the first unmatched person, try each
 * partner, and remember the best answer per set of people still free. That caps
 * the work at 2^n states — 256 for the eight this group ever reaches — so the
 * result is exact rather than a heuristic.
 *
 * Deterministic: partners are tried in order and ties keep the first, so the
 * same input always yields the same pairs.
 */
function matchOptimally(
  people: GroupablePerson[],
  penalty: (a: string, b: string) => number,
): GroupablePerson[][] {
  const n = people.length;
  const full = (1 << n) - 1;
  const memo = new Map<number, { cost: number; pairs: [number, number][] }>();

  const solve = (
    matched: number,
  ): { cost: number; pairs: [number, number][] } => {
    if (matched === full) {
      return { cost: 0, pairs: [] };
    }

    const cached = memo.get(matched);
    if (cached) {
      return cached;
    }

    let first = 0;
    while ((matched & (1 << first)) !== 0) {
      first += 1;
    }

    let best: { cost: number; pairs: [number, number][] } | null = null;

    for (let other = first + 1; other < n; other += 1) {
      if ((matched & (1 << other)) !== 0) {
        continue;
      }

      const rest = solve(matched | (1 << first) | (1 << other));
      const cost = penalty(people[first].id, people[other].id) + rest.cost;

      // Strictly less, so an equally good earlier partner keeps the slot.
      if (best === null || cost < best.cost) {
        best = { cost, pairs: [[first, other], ...rest.pairs] };
      }
    }

    const result = best as { cost: number; pairs: [number, number][] };
    memo.set(matched, result);
    return result;
  };

  return solve(0).pairs.map(([a, b]) => [people[a], people[b]]);
}

/**
 * Which pair the odd person joins: whichever costs least to join, counting both
 * members. Joining a pair you saw last period is avoided even when the other
 * member is a stranger.
 */
function pickTrioHost(
  pairs: GroupablePerson[][],
  thirdWheel: GroupablePerson,
  penalty: (a: string, b: string) => number,
): GroupablePerson[] {
  let best = pairs[0];
  let bestCost = Number.POSITIVE_INFINITY;

  for (const pair of pairs) {
    const cost = pair.reduce(
      (total, member) => total + penalty(member.id, thirdWheel.id),
      0,
    );

    if (cost < bestCost) {
      bestCost = cost;
      best = pair;
    }
  }

  return best;
}

/** The most recent pairing inside a group, i.e. its weakest link. */
function leastStale(
  members: GroupablePerson[],
  staleness: (a: string, b: string) => number,
): number | null {
  let worst = Number.POSITIVE_INFINITY;

  for (let i = 0; i < members.length; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) {
      worst = Math.min(worst, staleness(members[i].id, members[j].id));
    }
  }

  return Number.isFinite(worst) ? worst : null;
}

function buildPairHistory(history: PastGrouping[]): Map<string, number> {
  const lastTogether = new Map<string, number>();

  for (const grouping of history) {
    for (let i = 0; i < grouping.memberIds.length; i += 1) {
      for (let j = i + 1; j < grouping.memberIds.length; j += 1) {
        const key = pairKey(grouping.memberIds[i], grouping.memberIds[j]);
        const previous = lastTogether.get(key);

        if (previous === undefined || grouping.periodIndex > previous) {
          lastTogether.set(key, grouping.periodIndex);
        }
      }
    }
  }

  return lastTogether;
}

function countTrioMemberships(history: PastGrouping[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const grouping of history) {
    if (grouping.memberIds.length < 3) {
      continue;
    }

    for (const personId of grouping.memberIds) {
      counts.set(personId, (counts.get(personId) ?? 0) + 1);
    }
  }

  return counts;
}

/** Order-independent, so (a,b) and (b,a) are the same pairing. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
