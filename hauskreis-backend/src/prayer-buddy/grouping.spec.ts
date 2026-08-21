import {
  buildGroups,
  repairGroups,
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

/**
 * Besetzung je Gruppe, sortiert — meist die einzige Frage, die hier zählt.
 *
 * Neue Gruppen haben noch keine Id und landen unter `neu`; mehr als eine
 * entsteht beim Nachrücken nie.
 */
const shape = (groups: { id: string | null; memberIds: string[] }[]) =>
  Object.fromEntries(
    groups.map((group) => [group.id ?? 'neu', group.memberIds.toSorted()]),
  );

/** Nur die Größen, sortiert — für die Frage „wird keine Gruppe zu groß". */
const groupSizes = (groups: { memberIds: string[] }[]) =>
  groups
    .map((group) => group.memberIds.length)
    .filter((size) => size > 0)
    .toSorted();

/**
 * Die laufende Runde nachziehen ist eine andere Aufgabe als eine neue würfeln:
 * hier darf möglichst wenig passieren.
 */
describe('repairGroups', () => {
  it('nimmt heraus, wer nicht mehr dabei ist', () => {
    const repaired = repairGroups(
      [
        { id: 'g1', memberIds: ['a', 'b', 'c'] },
        { id: 'g2', memberIds: ['d', 'e'] },
      ],
      new Set(['a', 'c', 'd', 'e']),
    );

    expect(shape(repaired)).toEqual({ g1: ['a', 'c'], g2: ['d', 'e'] });
  });

  it('lässt niemanden allein zurück', () => {
    const repaired = repairGroups(
      [
        { id: 'g1', memberIds: ['a', 'b'] },
        { id: 'g2', memberIds: ['c', 'd'] },
        { id: 'g3', memberIds: ['e', 'f', 'g'] },
      ],
      new Set(['a', 'c', 'd', 'e', 'f', 'g']),
    );

    // `a` bleibt allein und zieht in die kleinste andere — nicht in die
    // Dreiergruppe, die ohnehin schon die größte ist.
    expect(shape(repaired)).toEqual({
      g1: [],
      g2: ['a', 'c', 'd'],
      g3: ['e', 'f', 'g'],
    });
  });

  it('setzt einen Neuzugang in die kleinste Gruppe', () => {
    const repaired = repairGroups(
      [
        { id: 'g1', memberIds: ['a', 'b'] },
        { id: 'g2', memberIds: ['c', 'd', 'e'] },
      ],
      new Set(['a', 'b', 'c', 'd', 'e', 'neu']),
    );

    expect(shape(repaired)).toEqual({
      g1: ['a', 'b', 'neu'],
      g2: ['c', 'd', 'e'],
    });
  });

  /** Der Grund, warum Zuzug vor Auflösung kommt. */
  it('füllt mit einem Neuzugang genau die Lücke, die ein Abgang riss', () => {
    const repaired = repairGroups(
      [
        { id: 'g1', memberIds: ['a', 'b'] },
        { id: 'g2', memberIds: ['c', 'd'] },
      ],
      new Set(['a', 'c', 'd', 'neu']),
    );

    // Aus zwei halben Problemen wird eine ganze Zweiergruppe, statt dass `a`
    // umzieht und der Neuzugang wieder eine Dreiergruppe erzwingt.
    expect(shape(repaired)).toEqual({ g1: ['a', 'neu'], g2: ['c', 'd'] });
  });

  it('lässt die Runde still enden, wenn nur eine Person übrig ist', () => {
    const repaired = repairGroups(
      [{ id: 'g1', memberIds: ['a', 'b'] }],
      new Set(['a']),
    );

    // Eine Gruppe aus einem Menschen wäre eine Behauptung, keine Zuteilung.
    expect(shape(repaired)).toEqual({ g1: [] });
  });

  /**
   * Der Fall aus der Praxis: In einer laufenden Zweierrunde kamen nacheinander
   * zwei Leute dazu — und beide landeten in derselben Gruppe, weil es keine
   * Obergrenze gab. Vier Menschen, von denen keiner mehr für jeden betet.
   */
  describe('die Obergrenze von drei', () => {
    it('macht aus zwei Neuzugängen auf ein Paar keine Vierergruppe', () => {
      const repaired = repairGroups(
        [{ id: 'g1', memberIds: ['a', 'b'] }],
        new Set(['a', 'b', 'x', 'y']),
      );

      // Das ursprüngliche Paar bleibt zusammen; die beiden Neuen finden sich.
      expect(shape(repaired)).toEqual({ g1: ['a', 'b'], neu: ['x', 'y'] });
    });

    /**
     * Und wer dazu muss, ist der zuletzt Dazugekommene — nicht irgendwer aus
     * dem Paar, das schon miteinander betet.
     */
    it('teilt eine volle Dreiergruppe zu 2+2, wenn jemand dazukommt', () => {
      const repaired = repairGroups(
        [{ id: 'g1', memberIds: ['a', 'b', 'c'] }],
        new Set(['a', 'b', 'c', 'neuling']),
      );

      expect(shape(repaired)).toEqual({
        g1: ['a', 'b'],
        neu: ['c', 'neuling'],
      });
    });

    it('lässt auch bei mehreren Gruppen keine über drei wachsen', () => {
      const repaired = repairGroups(
        [
          { id: 'g1', memberIds: ['a', 'b'] },
          { id: 'g2', memberIds: ['c', 'd'] },
        ],
        new Set(['a', 'b', 'c', 'd', 'x', 'y', 'z']),
      );

      expect(groupSizes(repaired)).toEqual([2, 2, 3]);
      expect(repaired.flatMap((group) => group.memberIds)).toHaveLength(7);
    });

    /** Bei freiem Platz bleibt alles beim Alten — die Grenze greift nur oben. */
    it('füllt weiterhin zuerst die kleinste Gruppe auf', () => {
      const repaired = repairGroups(
        [
          { id: 'g1', memberIds: ['a', 'b', 'c'] },
          { id: 'g2', memberIds: ['d', 'e'] },
        ],
        new Set(['a', 'b', 'c', 'd', 'e', 'neuling']),
      );

      expect(shape(repaired)).toEqual({
        g1: ['a', 'b', 'c'],
        g2: ['d', 'e', 'neuling'],
      });
    });

    /**
     * Regel 0, und der Grund, warum es sie gibt: Die Grenze galt zuerst nur
     * fürs Hinzufügen. Damit war eine Gruppe, die schon zu groß war,
     * unantastbar — es passte ja niemand mehr hinein.
     */
    it('teilt eine schon zu große Gruppe auf, auch ohne Veränderung', () => {
      const repaired = repairGroups(
        [{ id: 'g1', memberIds: ['a', 'b', 'c', 'd'] }],
        new Set(['a', 'b', 'c', 'd']),
      );

      // Getrimmt wird hinten: `d` fällt herunter, findet keinen Platz, und
      // holt sich den nächsten von hinten (`c`). Das erste Paar bleibt stehen.
      expect(shape(repaired)).toEqual({ g1: ['a', 'b'], neu: ['c', 'd'] });
    });

    /** Und dabei bleibt niemand allein zurück, auch bei ungerader Zahl nicht. */
    it('lässt beim Aufteilen einer Fünfergruppe keinen Einzelnen stehen', () => {
      const repaired = repairGroups(
        [{ id: 'g1', memberIds: ['a', 'b', 'c', 'd', 'e'] }],
        new Set(['a', 'b', 'c', 'd', 'e']),
      );

      expect(groupSizes(repaired)).toEqual([2, 3]);
    });
  });

  it('rührt eine unveränderte Runde nicht an', () => {
    const groups = [
      { id: 'g1', memberIds: ['a', 'b'] },
      { id: 'g2', memberIds: ['c', 'd'] },
    ];

    expect(shape(repairGroups(groups, new Set(['a', 'b', 'c', 'd'])))).toEqual(
      shape(groups),
    );
  });
});
