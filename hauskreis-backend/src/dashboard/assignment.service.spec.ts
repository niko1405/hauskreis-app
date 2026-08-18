import { AssignmentService } from './assignment.service';
// Type-only import keeps Jest from loading the real PrismaClient.
import type { PrismaService } from '../prisma/prisma.service';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const person = (id: string, name: string) => ({ id, name });

type MeetingRow = {
  id: string;
  date: Date;
  host?: { id: string; name: string } | null;
  location?: { name: string } | null;
  /** Die Zuteilung am Abend — steht auch ohne gewähltes Thema da. */
  topicResponsibles?: { person: { id: string; name: string } }[];
  /** Was gewählt wurde, falls schon etwas gewählt ist. */
  topicSession?: {
    title: string | null;
    topic: { title: string | null };
  } | null;
  songLeaders?: { person: { id: string; name: string } }[];
};

type GroupRow = {
  id: string;
  periodStart: Date;
  periodEnd: Date;
  members: { person: { id: string; name: string } }[];
};

function setup(meetings: MeetingRow[] = [], groups: GroupRow[] = []) {
  const meetingFindMany = jest.fn().mockResolvedValue(
    meetings.map((meeting) => ({
      host: null,
      location: null,
      topicResponsibles: [],
      topicSession: null,
      songLeaders: [],
      ...meeting,
    })),
  );
  const groupFindMany = jest.fn().mockResolvedValue(groups);

  // Geburtstage kommen nur dazu, wenn der Aufrufer eine Vorlaufzeit nennt —
  // die Mehrwochen-Tabelle tut das nicht, und dann läuft die Abfrage gar nicht.
  const birthdayFindMany = jest.fn().mockResolvedValue([]);

  const service = new AssignmentService({
    meeting: { findMany: meetingFindMany },
    prayerBuddyGroup: { findMany: groupFindMany },
    birthdayOccasion: { findMany: birthdayFindMany },
  } as unknown as PrismaService);

  return { service, meetingFindMany, groupFindMany, birthdayFindMany };
}

const range = { from: utc('2026-08-01'), to: utc('2026-08-31') };

describe('AssignmentService.findAssignments', () => {
  it('reports the host of an evening', async () => {
    const { service } = setup([
      {
        id: 'm1',
        date: utc('2026-08-04'),
        host: person('chris', 'chris'),
        location: { name: 'Bei Chris' },
      },
    ]);

    await expect(service.findAssignments('hk-1', range)).resolves.toEqual([
      {
        role: 'HOST',
        date: '2026-08-04',
        endDate: null,
        person: person('chris', 'chris'),
        meetingId: 'm1',
        groupId: null,
        occasionId: null,
        label: 'Bei Chris',
      },
    ]);
  });

  it('reports every topic responsible and every song leader', async () => {
    const { service } = setup([
      {
        id: 'm1',
        date: utc('2026-08-04'),
        topicResponsibles: [
          { person: person('antonia', 'Antonia') },
          { person: person('reini', 'Reini') },
        ],
        topicSession: { title: null, topic: { title: 'Vergebung' } },
        songLeaders: [
          { person: person('niko', 'Niko') },
          { person: person('julian', 'Julian') },
        ],
      },
    ]);

    const items = await service.findAssignments('hk-1', range);

    expect(items.map((item) => [item.role, item.person.name])).toEqual([
      ['TOPIC', 'Antonia'],
      ['TOPIC', 'Reini'],
      ['SONG', 'Julian'],
      ['SONG', 'Niko'],
    ]);
    expect(items[0].label).toBe('Vergebung');
  });

  it('names the others in a prayer buddy group, per member', async () => {
    const { service } = setup(
      [],
      [
        {
          id: 'g1',
          periodStart: utc('2026-08-01'),
          periodEnd: utc('2026-08-14'),
          members: [
            { person: person('niko', 'Niko') },
            { person: person('antonia', 'Antonia') },
            { person: person('reini', 'Reini') },
          ],
        },
      ],
    );

    const items = await service.findAssignments('hk-1', range);

    expect(items).toHaveLength(3);
    expect(items.find((item) => item.person.id === 'niko')).toMatchObject({
      role: 'PRAYER_BUDDY',
      date: '2026-08-01',
      endDate: '2026-08-14',
      groupId: 'g1',
      meetingId: null,
      label: 'mit Antonia und Reini',
    });
  });

  it('says "mit X" for a pair', async () => {
    const { service } = setup(
      [],
      [
        {
          id: 'g1',
          periodStart: utc('2026-08-01'),
          periodEnd: utc('2026-08-14'),
          members: [
            { person: person('niko', 'Niko') },
            { person: person('chris', 'chris') },
          ],
        },
      ],
    );

    const items = await service.findAssignments('hk-1', range);

    expect(items.find((item) => item.person.id === 'niko')?.label).toBe(
      'mit chris',
    );
  });

  it('filters to one person when asked', async () => {
    const { service } = setup(
      [
        {
          id: 'm1',
          date: utc('2026-08-04'),
          host: person('chris', 'chris'),
          songLeaders: [{ person: person('niko', 'Niko') }],
        },
      ],
      [
        {
          id: 'g1',
          periodStart: utc('2026-08-01'),
          periodEnd: utc('2026-08-14'),
          members: [
            { person: person('niko', 'Niko') },
            { person: person('chris', 'chris') },
          ],
        },
      ],
    );

    const items = await service.findAssignments('hk-1', {
      ...range,
      personId: 'niko',
    });

    // The buddy period starts on the 1st, the evening is on the 4th — sorting
    // is chronological, so the running period comes first.
    expect(items.map((item) => item.role)).toEqual(['PRAYER_BUDDY', 'SONG']);
  });

  it('leaves cancelled evenings out', async () => {
    const { service, meetingFindMany } = setup();

    await service.findAssignments('hk-1', range);

    // An evening that was called off is nobody's job any more.
    expect(meetingFindMany.mock.calls[0][0].where.status).toEqual({
      not: 'CANCELLED',
    });
  });

  it('counts a prayer buddy period that merely overlaps the window', async () => {
    const { service, groupFindMany } = setup();

    await service.findAssignments('hk-1', range);

    // A fortnight that started in July still runs in August, and that is what
    // somebody opening the week is asking about.
    expect(groupFindMany.mock.calls[0][0].where).toMatchObject({
      periodStart: { lte: range.to },
      periodEnd: { gte: range.from },
      discardedAt: null,
    });
  });

  it('sorts by date, then host before topic before songs', async () => {
    const { service } = setup([
      {
        id: 'm2',
        date: utc('2026-08-11'),
        host: person('elisha', 'elisha'),
      },
      {
        id: 'm1',
        date: utc('2026-08-04'),
        songLeaders: [{ person: person('niko', 'Niko') }],
        topicResponsibles: [{ person: person('antonia', 'Antonia') }],
        topicSession: { title: null, topic: { title: 'Vergebung' } },
        host: person('chris', 'chris'),
      },
    ]);

    const items = await service.findAssignments('hk-1', range);

    expect(items.map((item) => `${item.date} ${item.role}`)).toEqual([
      '2026-08-04 HOST',
      '2026-08-04 TOPIC',
      '2026-08-04 SONG',
      '2026-08-11 HOST',
    ]);
  });

  it('returns nothing rather than failing on an empty window', async () => {
    const { service } = setup();

    await expect(service.findAssignments('hk-1', range)).resolves.toEqual([]);
  });
});
