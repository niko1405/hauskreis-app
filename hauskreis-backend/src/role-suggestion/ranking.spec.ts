import { LOAD_HORIZON_DAYS, rankForRole } from './ranking';
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

  describe('load horizon', () => {
    const daysAhead = (days: number) =>
      new Date(TARGET.getTime() + days * 24 * 60 * 60 * 1000);

    it('counts a job inside the planning window as load', () => {
      const result = rankForRole({
        people,
        events: [
          { personId: 'anna', role: AssignmentRole.HOST, date: daysAhead(21) },
        ],
        role: AssignmentRole.HOST,
        targetDate: TARGET,
      });

      const anna = result.find((entry) => entry.personId === 'anna');
      expect(anna?.facts.upcomingCommitments).toHaveLength(1);
      expect(order(result)).toEqual(['ben', 'carla', 'anna']);
    });

    it('ignores one far beyond it', () => {
      const result = rankForRole({
        people,
        events: [
          {
            personId: 'anna',
            role: AssignmentRole.HOST,
            date: daysAhead(LOAD_HORIZON_DAYS + 7),
          },
        ],
        role: AssignmentRole.HOST,
        targetDate: TARGET,
      });

      // Saying yes to an evening months out must not drag Anna down today.
      const anna = result.find((entry) => entry.personId === 'anna');
      expect(anna?.facts.upcomingCommitments).toEqual([]);
      expect(order(result)).toEqual(['anna', 'ben', 'carla']);
    });
  });

  describe('multi-part jobs', () => {
    const topic = (personId: string, iso: string, slotKey: string) => ({
      personId,
      role: AssignmentRole.TOPIC,
      date: utc(iso),
      slotKey,
    });

    it('counts a topic spanning several evenings once', () => {
      const result = rankForRole({
        people: [people[0]],
        events: [
          topic('anna', '2026-08-04', 'topic-1'),
          topic('anna', '2026-08-11', 'topic-1'),
          topic('anna', '2026-08-18', 'topic-1'),
        ],
        role: AssignmentRole.TOPIC,
        targetDate: TARGET,
      });

      expect(result[0].facts.timesAssigned).toBe(1);
      // Recency still tracks the last evening she was actually responsible.
      expect(result[0].facts.lastAssignedAt).toBe('2026-08-18');
    });

    it('counts an upcoming multi-part topic as one commitment', () => {
      const result = rankForRole({
        people: [people[0]],
        events: [
          topic('anna', '2026-09-08', 'topic-2'),
          topic('anna', '2026-09-15', 'topic-2'),
          topic('anna', '2026-09-22', 'topic-2'),
        ],
        role: AssignmentRole.TOPIC,
        targetDate: TARGET,
      });

      // One job to prepare, dated at the evening it starts.
      expect(result[0].facts.upcomingCommitments).toEqual([
        { role: 'TOPIC', date: '2026-09-08' },
      ]);
    });

    it('still treats separate topics as separate slots', () => {
      const result = rankForRole({
        people: [people[0]],
        events: [
          topic('anna', '2026-08-04', 'topic-1'),
          topic('anna', '2026-08-18', 'topic-2'),
        ],
        role: AssignmentRole.TOPIC,
        targetDate: TARGET,
      });

      expect(result[0].facts.timesAssigned).toBe(2);
    });

    it('keeps hosting one job per evening', () => {
      const result = rankForRole({
        people: [people[0]],
        events: [hosted('anna', '2026-08-04'), hosted('anna', '2026-08-11')],
        role: AssignmentRole.HOST,
        targetDate: TARGET,
      });

      expect(result[0].facts.timesAssigned).toBe(2);
    });
  });
});
