import {
  MAX_CREDIT_MEETINGS,
  rankHomes,
  type HomeUse,
  type RankableHome,
} from './host-ranking';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const TARGET = utc('2026-09-01');
const WEEK = 7 * 24 * 60 * 60 * 1000;

const home = (id: string, name: string, hostWeight: number): RankableHome => ({
  id,
  name,
  hostWeight,
});

const order = (ranked: { home: { id: string } }[]) =>
  ranked.map((entry) => entry.home.id);

/**
 * Weekly evenings ending the week before the target, oldest first — `pattern`
 * lists which home each one took.
 */
function weekly(pattern: string[]): HomeUse[] {
  return pattern.map((locationId, index) => ({
    locationId,
    date: new Date(TARGET.getTime() - (pattern.length - index) * WEEK),
  }));
}

describe('rankHomes', () => {
  it('lets the weights decide before there is any history', () => {
    const result = rankHomes({
      homes: [home('a', 'Bei Anna', 3), home('b', 'Bei Ben', 1)],
      uses: [],
      targetDate: TARGET,
    });

    expect(order(result)).toEqual(['a', 'b']);
    expect(result[0].facts.credit).toBeCloseTo(0.75);
    expect(result[0].facts.timesUsed).toBe(0);
  });

  it('puts the home furthest behind its share first', () => {
    const homes = [home('main', 'Bei Anna', 3), home('far', 'Bei Ben', 1)];

    // 'main' should carry 75 % but has taken every evening so far.
    const result = rankHomes({
      homes,
      uses: weekly(['main', 'main', 'main', 'main']),
      targetDate: TARGET,
    });

    expect(order(result)).toEqual(['far', 'main']);
    expect(result[0].facts.credit).toBeGreaterThan(0);
    expect(result[1].facts.credit).toBeLessThan(0);
  });

  it('keeps the heavier home ahead while it is still under its share', () => {
    const homes = [home('main', 'Bei Anna', 3), home('far', 'Bei Ben', 1)];

    const result = rankHomes({
      homes,
      uses: weekly(['far', 'far', 'far', 'main']),
      targetDate: TARGET,
    });

    expect(order(result)).toEqual(['main', 'far']);
  });

  it('settles on the intended mix over time', () => {
    const homes = [
      home('a', 'Bei Anna', 3),
      home('b', 'Bei Ben', 1),
      home('c', 'Bei Carla', 1),
    ];

    // Replay 50 evenings, each time taking whatever the ranking suggests.
    const uses: HomeUse[] = [];
    for (let week = 0; week < 50; week += 1) {
      const date = new Date(TARGET.getTime() + week * WEEK);
      const [best] = rankHomes({ homes, uses, targetDate: date });
      uses.push({ locationId: best.home.id, date });
    }

    const count = (id: string) =>
      uses.filter((use) => use.locationId === id).length;

    // 3:1:1 over 50 evenings is 30/10/10; allow a little slack for the tail.
    expect(count('a')).toBeGreaterThanOrEqual(28);
    expect(count('a')).toBeLessThanOrEqual(32);
    expect(count('b')).toBeGreaterThanOrEqual(8);
    expect(count('c')).toBeGreaterThanOrEqual(8);
  });

  it('forgives a long absence instead of hoarding a backlog', () => {
    const homes = [
      home('away', 'Bei Anna', 1),
      home('b', 'Bei Ben', 1),
      home('c', 'Bei Carla', 1),
    ];

    // 26 evenings — half a year — split between the other two.
    const pattern = Array.from({ length: 26 }, (_, index) =>
      index % 2 === 0 ? 'b' : 'c',
    );

    const result = rankHomes({
      homes,
      uses: weekly(pattern),
      targetDate: TARGET,
    });

    expect(order(result)[0]).toBe('away');
    // Without the cap this would be worth roughly nine evenings, and 'away'
    // would block everyone else for two months on its return.
    expect(result[0].facts.credit).toBeLessThanOrEqual(MAX_CREDIT_MEETINGS);
  });

  it('lets the returning home rejoin the rotation after catching up', () => {
    const homes = [
      home('away', 'Bei Anna', 1),
      home('b', 'Bei Ben', 1),
      home('c', 'Bei Carla', 1),
    ];

    const uses = weekly(
      Array.from({ length: 26 }, (_, index) => (index % 2 === 0 ? 'b' : 'c')),
    );

    // Hand out the next evenings one at a time, always taking the top pick.
    const taken: string[] = [];
    for (let week = 0; week < 9; week += 1) {
      const date = new Date(TARGET.getTime() + week * WEEK);
      const [best] = rankHomes({ homes, uses, targetDate: date });
      taken.push(best.home.id);
      uses.push({ locationId: best.home.id, date });
    }

    // What matters is the run at the front, not the total: afterwards 'away'
    // should get its regular third of the evenings like everyone else.
    const catchUp = taken.findIndex((id) => id !== 'away');
    expect(catchUp).toBeLessThanOrEqual(3);

    // Uncapped this would have been nine evenings in a row; instead the other
    // two are back in play right after the catch-up.
    expect(new Set(taken.slice(catchUp, catchUp + 3)).size).toBeGreaterThan(1);
  });

  it('starts a newly added home neutral rather than owed everything', () => {
    const homes = [home('old', 'Bei Anna', 1), home('new', 'Bei Ben', 1)];

    // 'old' hosted 30 evenings before 'new' existed.
    const result = rankHomes({
      homes,
      uses: weekly(Array.from({ length: 30 }, () => 'old')),
      targetDate: TARGET,
    });

    expect(order(result)[0]).toBe('new');
    expect(result[0].facts.credit).toBeLessThanOrEqual(MAX_CREDIT_MEETINGS);
  });

  it('sends a household that is busy that evening to the back', () => {
    const homes = [home('a', 'Bei Anna', 3), home('b', 'Bei Ben', 1)];

    const result = rankHomes({
      homes,
      uses: [],
      targetDate: TARGET,
      deferredHomeIds: new Set(['a']),
    });

    // 'a' has the higher weight and would otherwise lead.
    expect(order(result)).toEqual(['b', 'a']);
    expect(result[1].deferred).toBe(true);
  });

  it('still returns a full list when every household is busy', () => {
    const homes = [home('a', 'Bei Anna', 3), home('b', 'Bei Ben', 1)];

    const result = rankHomes({
      homes,
      uses: [],
      targetDate: TARGET,
      deferredHomeIds: new Set(['a', 'b']),
    });

    expect(order(result)).toEqual(['a', 'b']);
    expect(result.every((entry) => entry.deferred)).toBe(true);
  });

  it('ignores evenings at homes no longer in the running', () => {
    const homes = [home('a', 'Bei Anna', 1), home('b', 'Bei Ben', 1)];

    const result = rankHomes({
      homes,
      uses: weekly(['gone', 'gone', 'a', 'b']),
      targetDate: TARGET,
    });

    expect(result.map((entry) => entry.facts.actualShare)).toEqual([0.5, 0.5]);
  });

  it('does not count evenings from the target date onwards as history', () => {
    const homes = [home('a', 'Bei Anna', 1), home('b', 'Bei Ben', 1)];

    const result = rankHomes({
      homes,
      uses: [
        { locationId: 'a', date: TARGET },
        { locationId: 'a', date: new Date(TARGET.getTime() + WEEK) },
      ],
      targetDate: TARGET,
    });

    expect(result.every((entry) => entry.facts.timesUsed === 0)).toBe(true);
  });

  it('reports the facts behind a suggestion', () => {
    const homes = [home('a', 'Bei Anna', 3), home('b', 'Bei Ben', 1)];

    const result = rankHomes({
      homes,
      uses: [{ locationId: 'a', date: utc('2026-08-11') }],
      targetDate: TARGET,
    });

    const anna = result.find((entry) => entry.home.id === 'a');
    expect(anna?.facts).toMatchObject({
      timesUsed: 1,
      lastUsedAt: '2026-08-11',
      daysSinceLastUse: 21,
      expectedShare: 0.75,
      actualShare: 1,
    });
  });

  it('never suggests a home weighted zero above one that is owed a turn', () => {
    const homes = [home('never', 'Bei Anna', 0), home('b', 'Bei Ben', 1)];

    const result = rankHomes({ homes, uses: [], targetDate: TARGET });

    expect(order(result)).toEqual(['b', 'never']);
    expect(result[1].facts.credit).toBe(0);
  });
});
