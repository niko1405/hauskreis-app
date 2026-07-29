import {
  buildGroups,
  type GroupablePerson,
  type PastGrouping,
} from './grouping';

const NAMES = [
  'Antonia',
  'Chris',
  'Elisha',
  'Erik',
  'Julian',
  'Marlene',
  'Niko',
  'Reini',
  'Sofie',
];

const people: GroupablePerson[] = NAMES.map((name) => ({
  id: name.toLowerCase(),
  name,
}));

const sizes = (groups: { members: unknown[] }[]) =>
  groups.map((group) => group.members.length).toSorted();

const idsOf = (groups: { members: GroupablePerson[] }[]) =>
  groups.map((group) => group.members.map((member) => member.id).toSorted());

/** Every unordered pair that shares a group. */
function pairsOf(groups: { members: GroupablePerson[] }[]): Set<string> {
  const pairs = new Set<string>();

  for (const group of groups) {
    const ids = group.members.map((member) => member.id).toSorted();
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        pairs.add(`${ids[i]}|${ids[j]}`);
      }
    }
  }

  return pairs;
}

describe('buildGroups', () => {
  it('splits nine people into 2/2/2/3', () => {
    const groups = buildGroups({ people, history: [], periodIndex: 0 });

    expect(sizes(groups)).toEqual([2, 2, 2, 3]);
    expect(groups.flatMap((group) => group.members)).toHaveLength(9);
  });

  it('uses only pairs when the count is even', () => {
    const groups = buildGroups({
      people: people.slice(0, 8),
      history: [],
      periodIndex: 0,
    });

    expect(sizes(groups)).toEqual([2, 2, 2, 2]);
  });

  it('puts everyone in exactly one group', () => {
    const groups = buildGroups({ people, history: [], periodIndex: 0 });
    const assigned = groups.flatMap((group) =>
      group.members.map((member) => member.id),
    );

    expect(new Set(assigned).size).toBe(people.length);
  });

  it('returns nothing for fewer than two people', () => {
    expect(buildGroups({ people: [], history: [], periodIndex: 0 })).toEqual(
      [],
    );
    expect(
      buildGroups({ people: people.slice(0, 1), history: [], periodIndex: 0 }),
    ).toEqual([]);
  });

  it('makes a single trio out of three', () => {
    const groups = buildGroups({
      people: people.slice(0, 3),
      history: [],
      periodIndex: 0,
    });

    expect(sizes(groups)).toEqual([3]);
  });

  it('is deterministic for the same history', () => {
    const first = buildGroups({ people, history: [], periodIndex: 0 });
    const second = buildGroups({ people, history: [], periodIndex: 0 });

    expect(idsOf(first)).toEqual(idsOf(second));
  });

  it('avoids repeating last period’s pairings', () => {
    const previous = buildGroups({ people, history: [], periodIndex: 0 });

    const history: PastGrouping[] = previous.map((group) => ({
      periodIndex: 0,
      memberIds: group.members.map((member) => member.id),
    }));

    const next = buildGroups({ people, history, periodIndex: 1 });

    const before = pairsOf(previous);
    const repeated = [...pairsOf(next)].filter((pair) => before.has(pair));

    expect(repeated).toEqual([]);
  });

  it('keeps repeats away over a long run', () => {
    const history: PastGrouping[] = [];
    const gaps: number[] = [];

    for (let period = 0; period < 12; period += 1) {
      const groups = buildGroups({ people, history, periodIndex: period });

      for (const group of groups) {
        if (group.lastTogetherPeriodsAgo !== null) {
          gaps.push(group.lastTogetherPeriodsAgo);
        }
        history.push({
          periodIndex: period,
          memberIds: group.members.map((member) => member.id),
        });
      }
    }

    // The guarantee that matters: never the same two people two periods
    // running. Everyone has to be matched every period, so with 36 possible
    // pairs and 4-5 used each time a gap of two is the realistic floor.
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(2);
  });

  it('spreads the trio around instead of always picking the same person', () => {
    const history: PastGrouping[] = [];
    const trioCounts = new Map<string, number>();

    for (let period = 0; period < 18; period += 1) {
      const groups = buildGroups({ people, history, periodIndex: period });

      for (const group of groups) {
        if (group.members.length === 3) {
          for (const member of group.members) {
            trioCounts.set(member.id, (trioCounts.get(member.id) ?? 0) + 1);
          }
        }
        history.push({
          periodIndex: period,
          memberIds: group.members.map((member) => member.id),
        });
      }
    }

    // 18 trios of three over nine people: six each would be even. Nobody
    // should be stuck there anywhere near every time, and nobody skipped.
    expect(Math.max(...trioCounts.values())).toBeLessThanOrEqual(10);
    expect(trioCounts.size).toBe(9);
  });

  it('prefers people who have never been together', () => {
    const four = people.slice(0, 4);
    // Antonia and Chris were together last period; Elisha and Erik never.
    const history: PastGrouping[] = [
      { periodIndex: 0, memberIds: ['antonia', 'chris'] },
      { periodIndex: 0, memberIds: ['elisha', 'julian'] },
    ];

    const groups = buildGroups({ people: four, history, periodIndex: 1 });

    expect(idsOf(groups)).not.toContainEqual(['antonia', 'chris']);
  });

  it('reports how stale a group’s pairings are', () => {
    const history: PastGrouping[] = [
      { periodIndex: 2, memberIds: ['antonia', 'chris'] },
    ];

    const groups = buildGroups({
      people: people.slice(0, 2),
      history,
      periodIndex: 5,
    });

    expect(groups[0].lastTogetherPeriodsAgo).toBe(3);
  });

  it('reports null when a group has never met', () => {
    const groups = buildGroups({
      people: people.slice(0, 2),
      history: [],
      periodIndex: 5,
    });

    expect(groups[0].lastTogetherPeriodsAgo).toBeNull();
  });
});
