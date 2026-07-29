import { rankHomes, type HomeUse, type RankableHome } from './host-ranking';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const TARGET = utc('2026-09-01');
const WEEK = 7 * 24 * 60 * 60 * 1000;

const home = (id: string, hostWeight: number): RankableHome => ({
  id,
  name: `Bei ${id}`,
  hostWeight,
  capacity: null,
});

/** Weekly evenings ending the week before the target, oldest first. */
function weekly(pattern: string[]): HomeUse[] {
  return pattern.map((locationId, index) => ({
    locationId,
    date: new Date(TARGET.getTime() - (pattern.length - index) * WEEK),
  }));
}

/** `away` maps a home to the evenings (counted back from TARGET) it was empty. */
const awayFor =
  (away: Record<string, number[]>) => (id: string, date: Date) => {
    const weeksBack = Math.round((TARGET.getTime() - date.getTime()) / WEEK);
    return (away[id] ?? []).includes(weeksBack);
  };

describe('rankHomes with absences', () => {
  it('earns nothing while the household is away', () => {
    const uses = weekly(['a', 'a', 'a', 'a']);

    const present = rankHomes({
      homes: [home('a', 1), home('b', 1)],
      uses,
      targetDate: TARGET,
    });

    const awayThroughout = rankHomes({
      homes: [home('a', 1), home('b', 1)],
      uses,
      targetDate: TARGET,
      awayOn: awayFor({ b: [4, 3, 2, 1] }),
    });

    // Four evenings at A while B was on holiday. Present, B would be owed
    // plenty; away, it comes back level rather than with a backlog.
    const creditPresent = present.find((entry) => entry.home.id === 'b')!.facts
      .credit;
    const creditAway = awayThroughout.find((entry) => entry.home.id === 'b')!
      .facts.credit;

    expect(creditPresent).toBeGreaterThan(creditAway);
  });

  it('hands the absent share to the homes still in the running', () => {
    const uses = weekly(['a', 'a']);

    const ranked = rankHomes({
      homes: [home('a', 1), home('b', 1), home('c', 1)],
      uses,
      targetDate: TARGET,
      awayOn: awayFor({ c: [2, 1] }),
    });

    // With C away, each evening splits between A and B — a half each rather
    // than a third. Otherwise C's share would evaporate and everyone present
    // would drift towards looking underserved.
    const b = ranked.find((entry) => entry.home.id === 'b')!;
    expect(b.facts.credit).toBeCloseTo(0.5 + 0.5 + 1 / 3);
  });

  it('still counts an evening the household hosted before leaving', () => {
    const ranked = rankHomes({
      homes: [home('a', 1), home('b', 1)],
      uses: weekly(['b', 'a']),
      targetDate: TARGET,
      awayOn: awayFor({ b: [1] }),
    });

    // Hosting is history, absence is availability — one does not erase the
    // other.
    expect(ranked.find((entry) => entry.home.id === 'b')!.facts.timesUsed).toBe(
      1,
    );
  });

  it('sets an empty home aside for the evening being planned', () => {
    const ranked = rankHomes({
      homes: [home('a', 1), home('b', 5)],
      uses: [],
      targetDate: TARGET,
      awayOn: awayFor({ b: [0] }),
    });

    // B has by far the higher weight and would otherwise lead.
    expect(ranked.map((entry) => entry.home.id)).toEqual(['a', 'b']);
    expect(ranked[1].deferred).toBe(true);
    expect(ranked[1].deferredReason).toBe('AWAY');
  });

  it('reports being away rather than being too small', () => {
    const ranked = rankHomes({
      homes: [{ id: 'a', name: 'Bei Sofie', hostWeight: 1, capacity: 5 }],
      uses: [],
      targetDate: TARGET,
      expectedAttendance: 9,
      awayOn: awayFor({ a: [0] }),
    });

    // Both apply; "im Urlaub" is the honest answer, and unlike "zu klein" it is
    // not something more cancellations would fix.
    expect(ranked[0].deferredReason).toBe('AWAY');
  });

  it('behaves exactly as before when nobody is away', () => {
    const uses = weekly(['a', 'b', 'a']);
    const homes = [home('a', 2), home('b', 1)];

    const withoutCallback = rankHomes({ homes, uses, targetDate: TARGET });
    const withEmptyCallback = rankHomes({
      homes,
      uses,
      targetDate: TARGET,
      awayOn: () => false,
    });

    expect(withEmptyCallback).toEqual(withoutCallback);
  });

  it('does not fall over when every home is away', () => {
    const ranked = rankHomes({
      homes: [home('a', 1), home('b', 1)],
      uses: weekly(['a']),
      targetDate: TARGET,
      awayOn: () => true,
    });

    // Nothing to hand out and nothing to divide by; every home is simply set
    // aside and the caller decides what to do with an empty evening.
    expect(ranked).toHaveLength(2);
    expect(ranked.every((entry) => entry.deferred)).toBe(true);
  });
});
