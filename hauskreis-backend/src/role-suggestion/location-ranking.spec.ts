import { rankLocations, type RankableLocation } from './location-ranking';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const TARGET = utc('2026-09-01');

const location = (
  id: string,
  name: string,
  frequencyFactor: number,
): RankableLocation => ({ id, name, frequencyFactor, requiresHost: true });

const order = (suggestions: { locationId: string }[]) =>
  suggestions.map((suggestion) => suggestion.locationId);

/** `count` uses of `locationId`, one week apart, ending before the target. */
const uses = (locationId: string, count: number) =>
  Array.from({ length: count }, (_, index) => ({
    locationId,
    date: new Date(TARGET.getTime() - (index + 1) * 7 * 24 * 60 * 60 * 1000),
  }));

describe('rankLocations', () => {
  it('favours the location furthest below its intended share', () => {
    const locations = [
      location('main', 'Bei Anna', 3),
      location('far', 'Bei Ben (Vorort)', 1),
    ];

    // 'main' should hold 75% but has had 100% of the evenings so far.
    const result = rankLocations({
      locations,
      uses: uses('main', 8),
      targetDate: TARGET,
    });

    expect(order(result)).toEqual(['far', 'main']);
    expect(result[0].facts).toMatchObject({
      timesUsed: 0,
      expectedShare: 0.25,
      actualShare: 0,
    });
  });

  it('keeps a weighted location on top while it is still under its share', () => {
    const locations = [
      location('main', 'Bei Anna', 3),
      location('far', 'Bei Ben (Vorort)', 1),
    ];

    // 'far' has had 3 of 4 evenings — well past its 25%.
    const result = rankLocations({
      locations,
      uses: [...uses('far', 3), ...uses('main', 1)],
      targetDate: TARGET,
    });

    expect(order(result)).toEqual(['main', 'far']);
  });

  it('falls back to the longest unused when shares are equal', () => {
    const locations = [
      location('a', 'Bei Anna', 1),
      location('b', 'Bei Ben', 1),
    ];

    const result = rankLocations({
      locations,
      uses: [
        { locationId: 'a', date: utc('2026-08-25') },
        { locationId: 'b', date: utc('2026-07-07') },
      ],
      targetDate: TARGET,
    });

    expect(order(result)).toEqual(['b', 'a']);
    expect(result[0].facts.daysSinceLastUse).toBe(56);
  });

  it('does not let a retired location distort the shares', () => {
    const locations = [
      location('a', 'Bei Anna', 1),
      location('b', 'Bei Ben', 1),
    ];

    // 'gone' is no longer in the candidate list, so its 10 past evenings are
    // not part of the denominator — a and b are still tied at 50/50.
    const result = rankLocations({
      locations,
      uses: [...uses('gone', 10), ...uses('a', 2), ...uses('b', 2)],
      targetDate: TARGET,
    });

    expect(result[0].facts.actualShare).toBe(0.5);
    expect(result[1].facts.actualShare).toBe(0.5);
  });

  it('handles a group with no history yet', () => {
    const result = rankLocations({
      locations: [location('a', 'Bei Anna', 3), location('b', 'Bei Ben', 1)],
      uses: [],
      targetDate: TARGET,
    });

    // Nothing used yet, so the weights decide outright.
    expect(order(result)).toEqual(['a', 'b']);
    expect(result[0].facts.actualShare).toBe(0);
    expect(result.every((entry) => entry.facts.lastUsedAt === null)).toBe(true);
  });
});
