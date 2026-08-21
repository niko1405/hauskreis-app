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
  /** How many people fit. Null means no meaningful limit. */
  capacity: number | null;
}

/**
 * Why a home is set aside for one evening.
 *
 * `AWAY` — nobody who could host there is in town.
 * `TOO_SMALL` — more people are coming than fit.
 * `HOUSEHOLD_BUSY` — every eligible resident already has another job that night.
 *
 * `AWAY` is the odd one out and the only one that also changes the arithmetic:
 * the other two keep earning credit while set aside, because the opportunity was
 * denied by the circumstances. A household on holiday gave the evening up, so it
 * earns nothing — see `awayOn` below.
 */
export type DeferralReason = 'AWAY' | 'TOO_SMALL' | 'HOUSEHOLD_BUSY';

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
  /** What the home takes, and how many are expected — both for the UI to explain. */
  capacity: number | null;
  expectedAttendance: number | null;
  timesUsed: number;
  lastUsedAt: string | null;
  daysSinceLastUse: number | null;
  /** Share of all evenings this home should carry, from its weight. 0–1. */
  expectedShare: number;
  /** Share it actually carried so far. 0–1. */
  actualShare: number;
  /**
   * How many past evenings the two shares were computed over.
   *
   * There so the UI can talk in evenings instead of percentages: "3 von 14,
   * üblich wären 5" is countable, "21 statt 36 %" is not — and at zero it says
   * plainly that there is nothing to compare yet, where a share would print a
   * confident "0 statt 36 %" about a home nobody has ever been to.
   */
  meetingsCounted: number;
}

export interface HomeRanking {
  home: RankableHome;
  facts: HomeFacts;
  /**
   * Set aside for this one evening. Pushed to the back rather than removed — a
   * demotion survives having no better option left, a filter does not.
   */
  deferred: boolean;
  deferredReason: DeferralReason | null;
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
 *
 * Being set aside for one evening is deliberately *not* that case. A home that
 * is too small for a full house, or whose residents are busy, keeps earning —
 * it was ready and the circumstances said no. That is what lets a small home
 * build up enough credit to win the rare evening it does fit, instead of
 * competing from scratch every time and effectively never hosting.
 */
export function rankHomes(params: {
  homes: RankableHome[];
  uses: HomeUse[];
  targetDate: Date;
  /**
   * How many people are expected. Null when it cannot be told yet, which
   * counts as "everyone" — the cautious reading, since a home that turns out
   * too small on the night is the failure worth avoiding.
   */
  expectedAttendance?: number | null;
  /** Homes whose every eligible resident is busy that evening. */
  busyHomeIds?: ReadonlySet<string>;
  /**
   * Whether a home was unavailable on a given date because its household was
   * away. Asked for every evening in the history, not just the one being
   * planned: a home that was on holiday must not come back owed three evenings.
   */
  awayOn?: (homeId: string, date: Date) => boolean;
}): HomeRanking[] {
  const { homes, uses, targetDate, busyHomeIds } = params;
  const expectedAttendance = params.expectedAttendance ?? null;
  const awayOn = params.awayOn ?? (() => false);

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

  /**
   * Hands out one evening's worth of credit among the homes that were actually
   * in the running that night.
   *
   * A household on holiday drops out of the denominator as well as out of the
   * payout. Leaving it in the denominator would mean its share evaporates and
   * everyone present ends up slightly short — over a long absence the whole
   * group would drift towards looking underserved, which is the same as nobody
   * being owed anything.
   */
  const settle = (date: Date) => {
    const present = homes.filter((home) => !awayOn(home.id, date));

    if (present.length === 0) {
      return;
    }

    const presentWeight = present.reduce(
      (sum, home) => sum + home.hostWeight,
      0,
    );

    for (const home of present) {
      const share =
        presentWeight > 0
          ? home.hostWeight / presentWeight
          : 1 / present.length;
      const current = (credit.get(home.id) as number) + share;

      credit.set(
        home.id,
        Math.max(-MAX_CREDIT_MEETINGS, Math.min(MAX_CREDIT_MEETINGS, current)),
      );
    }
  };

  for (const use of history) {
    settle(use.date);
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
  settle(targetDate);

  return homes
    .map((home): HomeRanking => {
      const used = timesUsed.get(home.id) as number;
      const last = lastUsedAt.get(home.id);
      const reason = deferralReason(
        home,
        expectedAttendance,
        busyHomeIds,
        awayOn(home.id, targetDate),
      );

      return {
        home,
        deferred: reason !== null,
        deferredReason: reason,
        facts: {
          credit: round(credit.get(home.id) as number),
          capacity: home.capacity,
          expectedAttendance,
          timesUsed: used,
          lastUsedAt: last ? isoDate(last) : null,
          daysSinceLastUse: last
            ? Math.round((targetDate.getTime() - last.getTime()) / MS_PER_DAY)
            : null,
          expectedShare: round(earnPerMeeting(home)),
          actualShare: history.length > 0 ? round(used / history.length) : 0,
          // Dieselbe Grundmenge wie `actualShare`: nur Abende an Zuhausen, die
          // noch im Rennen sind (`known`). Ein stillgelegtes Zuhause darf den
          // Nenner nicht aufblähen.
          meetingsCounted: history.length,
        },
      };
    })
    .toSorted(compare);
}

/**
 * Away beats everything: an empty flat is not a matter of degree, and telling
 * someone on holiday that their place is merely "too small tonight" would be
 * misleading.
 *
 * Too small then beats busy: it is the fact the group can act on
 * ("erst wenn genug absagen"), while a busy household is a scheduling detail.
 */
function deferralReason(
  home: RankableHome,
  expectedAttendance: number | null,
  busyHomeIds: ReadonlySet<string> | undefined,
  away: boolean,
): DeferralReason | null {
  if (away) {
    return 'AWAY';
  }

  if (
    home.capacity !== null &&
    (expectedAttendance ?? Infinity) > home.capacity
  ) {
    return 'TOO_SMALL';
  }

  return busyHomeIds?.has(home.id) ? 'HOUSEHOLD_BUSY' : null;
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
