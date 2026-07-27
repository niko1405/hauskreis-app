import { rankForRole } from './ranking';
import {
  AssignmentRole,
  type RoleAssignmentEvent,
} from './role-assignment.types';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const TARGET = utc('2026-09-01');

const people = [
  { id: 'anna', name: 'Anna' },
  { id: 'ben', name: 'Ben' },
  { id: 'carla', name: 'Carla' },
];

const hosted = (personId: string, iso: string): RoleAssignmentEvent => ({
  personId,
  role: AssignmentRole.HOST,
  date: utc(iso),
});

const order = (suggestions: { personId: string }[]) =>
  suggestions.map((suggestion) => suggestion.personId);

describe('rankForRole', () => {
  it('puts whoever hosted longest ago first', () => {
    const result = rankForRole({
      people,
      events: [
        hosted('anna', '2026-08-25'),
        hosted('ben', '2026-06-02'),
        hosted('carla', '2026-07-14'),
      ],
      role: AssignmentRole.HOST,
      targetDate: TARGET,
    });

    expect(order(result)).toEqual(['ben', 'carla', 'anna']);
    expect(result[0].rank).toBe(1);
  });

  it('ranks someone who has never hosted above everyone else', () => {
    const result = rankForRole({
      people,
      events: [hosted('anna', '2020-01-07'), hosted('carla', '2026-08-25')],
      role: AssignmentRole.HOST,
      targetDate: TARGET,
    });

    expect(order(result)[0]).toBe('ben');
    expect(result[0].facts).toMatchObject({
      lastAssignedAt: null,
      daysSinceLastAssignment: null,
      timesAssigned: 0,
    });
  });

  it('demotes people who are already booked for something later', () => {
    // Anna has the longest gap by far, but is down for two evenings ahead.
    const result = rankForRole({
      people,
      events: [
        hosted('anna', '2025-01-07'),
        hosted('anna', '2026-09-08'),
        hosted('anna', '2026-09-15'),
        hosted('ben', '2026-08-25'),
        hosted('carla', '2026-08-18'),
      ],
      role: AssignmentRole.HOST,
      targetDate: TARGET,
    });

    expect(order(result)).toEqual(['carla', 'ben', 'anna']);
    expect(result[2].facts.upcomingCommitments).toEqual([
      { role: 'HOST', date: '2026-09-08' },
      { role: 'HOST', date: '2026-09-15' },
    ]);
  });

  it('counts a job on the target date itself as a commitment, not history', () => {
    const result = rankForRole({
      people,
      events: [hosted('anna', '2026-09-01')],
      role: AssignmentRole.HOST,
      targetDate: TARGET,
    });

    const anna = result.find((entry) => entry.personId === 'anna');
    expect(anna?.facts.timesAssigned).toBe(0);
    expect(anna?.facts.upcomingCommitments).toHaveLength(1);
  });

  it('breaks a tie on the total count, then on the name', () => {
    const result = rankForRole({
      people,
      events: [
        hosted('anna', '2026-05-05'),
        hosted('anna', '2026-08-11'),
        hosted('ben', '2026-08-11'),
        hosted('carla', '2026-08-11'),
      ],
      role: AssignmentRole.HOST,
      targetDate: TARGET,
    });

    // All three last hosted on the same evening; Anna has done it twice, and
    // Ben/Carla are separated only by name so the list never reshuffles.
    expect(order(result)).toEqual(['ben', 'carla', 'anna']);
  });

  it('reports the facts behind a suggestion', () => {
    const result = rankForRole({
      people: [people[0]],
      events: [hosted('anna', '2026-06-02'), hosted('anna', '2026-08-11')],
      role: AssignmentRole.HOST,
      targetDate: TARGET,
    });

    expect(result[0].facts).toEqual({
      lastAssignedAt: '2026-08-11',
      daysSinceLastAssignment: 21,
      timesAssigned: 2,
      upcomingCommitments: [],
    });
  });

  it('ignores events for people outside the eligible set', () => {
    const result = rankForRole({
      people: [people[0]],
      events: [
        hosted('anna', '2026-08-11'),
        hosted('someone-else', '2026-08-04'),
      ],
      role: AssignmentRole.HOST,
      targetDate: TARGET,
    });

    expect(result).toHaveLength(1);
    expect(result[0].facts.timesAssigned).toBe(1);
  });
});
