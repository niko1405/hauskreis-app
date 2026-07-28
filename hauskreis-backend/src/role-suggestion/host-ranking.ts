const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * How far a home can drift from its target before the difference is forgiven,
 * measured in meetings.
 *
 * Undisturbed, the credit never leaves roughly ±0.8 whatever the weights are —
 * a home that climbs to the top gets the evening and drops back by one. The cap
 * sits just above that, so it does nothing in normal operation and only bites
 * after a real disruption: someone who could not host for months would
 * otherwise return owed a dozen evenings and block everyone else for weeks.
 *
 * It applies in both directions, which is what bounds the catch-up: the
 * returning home starts at `+MAX`, those who carried the load sit at `-MAX`,
 * so the gap is `2 × MAX` and settles within about three evenings. Raising the
 * cap widens that gap in proportion — beyond it the missed turns are simply
 * gone, in both directions.
 */
export const MAX_CREDIT_MEETINGS = 1.5;

export interface RankableHome {
  id: string;
  name: string;
  /** Relative share of evenings this home should carry. */
  hostWeight: number;
}

/** One past evening that took place at a host-bound home. */
export interface HomeUse {
  locationId: string;
  date: Date;
}

export interface HomeFacts {
  /**
   * How many evenings this home is owed, in meetings. Positive means behind
   * its share, negative means it has hosted more than its share.
   */
  credit: number;
  timesUsed: number;
  lastUsedAt: string | null;
  daysSinceLastUse: number | null;
  /** Share of all evenings this home should carry, from its weight. 0–1. */
  expectedShare: number;
  /** Share it actually carried so far. 0–1. */
  actualShare: number;
}

export interface HomeRanking {
  home: RankableHome;
  facts: HomeFacts;
  /**
   * True when every eligible resident already has something else on that
   * evening. The home is pushed to the back rather than removed — a demotion
   * survives having no better option left, a filter does not.
   */
  deferred: boolean;
}

/**
 * Ranks homes for one evening: who is most owed a turn.
 *
 * Rather than comparing all-time shares, this replays the history meeting by
 * meeting and keeps a running credit per home: every evening each home earns
 * its weight's worth of a turn, and whoever hosts spends one.
 *
 * The replay is what makes forgiveness possible at all. A cap applied to a
 * figure recomputed from all-time totals does nothing — the raw backlog is
 * still there and reappears the moment the home hosts once. Applied *during*
 * the replay it actually forgets, because each step carries the capped value
 * forward. It also means a home added later starts neutral instead of being
 * hammered until it has caught up with everyone's all-time count.
 *
 * The same structure is where absences plug in (Phase 9): a home whose
 * residents are away simply earns nothing for those evenings, so no backlog
 * builds up in the first place and the cap stays the safety net it is meant to
 * be. That is why the accrual is per meeting and not a closed formula.
 */
export function rankHomes(params: {
  homes: RankableHome[];
  uses: HomeUse[];
  targetDate: Date;
  /** Homes whose every eligible resident is busy that evening. */
  deferredHomeIds?: ReadonlySet<string>;
}): HomeRanking[] {
  const { homes, uses, targetDate, deferredHomeIds } = params;

  const totalWeight = homes.reduce((sum, home) => sum + home.hostWeight, 0);

  // Only evenings at homes that are still in the running count, so the shares
  // add up over the same set that is being ranked. A home the group has retired
  // must not shrink everyone else's apparent share.
  const known = new Set(homes.map((home) => home.id));
  const history = uses
    .filter((use) => known.has(use.locationId) && use.date < targetDate)
    .toSorted((a, b) => a.date.getTime() - b.date.getTime());

  const credit = new Map(homes.map((home) => [home.id, 0]));
  const timesUsed = new Map(homes.map((home) => [home.id, 0]));
  const lastUsedAt = new Map<string, Date>();

  const earnPerMeeting = (home: RankableHome) =>
    totalWeight > 0 ? home.hostWeight / totalWeight : 1 / homes.length;

  const settle = () => {
    for (const home of homes) {
      const current = (credit.get(home.id) as number) + earnPerMeeting(home);
      credit.set(
        home.id,
        Math.max(-MAX_CREDIT_MEETINGS, Math.min(MAX_CREDIT_MEETINGS, current)),
      );
    }
  };

  for (const use of history) {
    settle();
    credit.set(use.locationId, (credit.get(use.locationId) as number) - 1);
    timesUsed.set(
      use.locationId,
      (timesUsed.get(use.locationId) as number) + 1,
    );

    const previous = lastUsedAt.get(use.locationId);
    if (!previous || use.date > previous) {
      lastUsedAt.set(use.locationId, use.date);
    }
  }

  // One more round for the evening being planned: the question is who is most
  // owed *including* this slot, which is also what gives a sensible order
  // before any history exists at all.
  settle();

  return homes
    .map((home) => {
      const used = timesUsed.get(home.id) as number;
      const last = lastUsedAt.get(home.id);

      return {
        home,
        deferred: deferredHomeIds?.has(home.id) ?? false,
        facts: {
          credit: round(credit.get(home.id) as number),
          timesUsed: used,
          lastUsedAt: last ? isoDate(last) : null,
          daysSinceLastUse: last
            ? Math.round((targetDate.getTime() - last.getTime()) / MS_PER_DAY)
            : null,
          expectedShare: round(earnPerMeeting(home)),
          actualShare: history.length > 0 ? round(used / history.length) : 0,
        },
      };
    })
    .toSorted(compare);
}

function compare(a: HomeRanking, b: HomeRanking): number {
  // A home nobody can host at that evening goes last, whatever it is owed.
  if (a.deferred !== b.deferred) {
    return a.deferred ? 1 : -1;
  }

  if (a.facts.credit !== b.facts.credit) {
    return b.facts.credit - a.facts.credit;
  }

  // Two equally-owed homes: the one unused longest. Never used wins.
  const gapA = a.facts.daysSinceLastUse ?? Number.POSITIVE_INFINITY;
  const gapB = b.facts.daysSinceLastUse ?? Number.POSITIVE_INFINITY;
  if (gapA !== gapB) {
    return gapB - gapA;
  }

  return a.home.name.localeCompare(b.home.name);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Keeps floating point noise out of the API and out of the comparisons. */
function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
