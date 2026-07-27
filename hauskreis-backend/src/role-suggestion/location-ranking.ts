const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface RankableLocation {
  id: string;
  name: string;
  frequencyFactor: number;
  requiresHost: boolean;
}

/** One past use of a location, i.e. one meeting that took place there. */
export interface LocationUse {
  locationId: string;
  date: Date;
}

export interface LocationSuggestionFacts {
  timesUsed: number;
  lastUsedAt: string | null;
  daysSinceLastUse: number | null;
  /** Share this location *should* have, from its `frequencyFactor`. 0–1. */
  expectedShare: number;
  /** Share it actually had so far. 0–1. */
  actualShare: number;
}

export interface LocationSuggestion {
  locationId: string;
  name: string;
  frequencyFactor: number;
  requiresHost: boolean;
  rank: number;
  facts: LocationSuggestionFacts;
}

/**
 * Ranks locations by how far behind their intended share they are.
 *
 * Locations are not equal: the three homes nearby should come up far more often
 * than the ones across town, so plain rotation would be wrong. `frequencyFactor`
 * expresses the intended mix, and the ranking simply asks *who is furthest below
 * their share* — a location used less than its weight suggests moves up, one
 * used more moves down, and the mix settles on the intended ratio by itself.
 *
 * Tie-break is the longest gap since the last use, so two equally on-target
 * locations don't come up two weeks running.
 */
export function rankLocations(params: {
  locations: RankableLocation[];
  uses: LocationUse[];
  targetDate: Date;
}): LocationSuggestion[] {
  const { locations, uses, targetDate } = params;

  const totalFactor = locations.reduce(
    (sum, location) => sum + location.frequencyFactor,
    0,
  );

  // Only uses of locations still in the running count, so the shares add up to
  // 1 over the same set that is being ranked. A place the group has retired
  // must not shrink everyone else's apparent share.
  const relevant = new Set(locations.map((location) => location.id));
  const counted = uses.filter((use) => relevant.has(use.locationId));

  const stats = new Map<string, { count: number; lastUsedAt: Date | null }>(
    locations.map((location) => [location.id, { count: 0, lastUsedAt: null }]),
  );

  for (const use of counted) {
    const entry = stats.get(use.locationId);

    if (!entry) {
      continue;
    }

    entry.count += 1;

    if (entry.lastUsedAt === null || use.date > entry.lastUsedAt) {
      entry.lastUsedAt = use.date;
    }
  }

  return locations
    .map((location) => {
      const entry = stats.get(location.id) as {
        count: number;
        lastUsedAt: Date | null;
      };

      const facts: LocationSuggestionFacts = {
        timesUsed: entry.count,
        lastUsedAt: entry.lastUsedAt
          ? entry.lastUsedAt.toISOString().slice(0, 10)
          : null,
        daysSinceLastUse: entry.lastUsedAt
          ? Math.round(
              (targetDate.getTime() - entry.lastUsedAt.getTime()) / MS_PER_DAY,
            )
          : null,
        // No locations or no history yet: fall back to an even split rather
        // than dividing by zero.
        expectedShare:
          totalFactor > 0
            ? location.frequencyFactor / totalFactor
            : 1 / locations.length,
        actualShare: counted.length > 0 ? entry.count / counted.length : 0,
      };

      return { location, facts };
    })
    .toSorted((a, b) => {
      const deficitA = a.facts.expectedShare - a.facts.actualShare;
      const deficitB = b.facts.expectedShare - b.facts.actualShare;

      if (deficitA !== deficitB) {
        return deficitB - deficitA;
      }

      const gapA = a.facts.daysSinceLastUse ?? Number.POSITIVE_INFINITY;
      const gapB = b.facts.daysSinceLastUse ?? Number.POSITIVE_INFINITY;

      if (gapA !== gapB) {
        return gapB - gapA;
      }

      return a.location.name.localeCompare(b.location.name);
    })
    .map((entry, index) => ({
      locationId: entry.location.id,
      name: entry.location.name,
      frequencyFactor: entry.location.frequencyFactor,
      requiresHost: entry.location.requiresHost,
      rank: index + 1,
      facts: entry.facts,
    }));
}
