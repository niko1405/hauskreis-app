import { DashboardService } from './dashboard.service';
// Type-only imports keep Jest from loading the real PrismaClient.
import type { PrismaService } from '../prisma/prisma.service';
import type { AssignmentService } from './assignment.service';
import type { PrayerBuddyService } from '../prayer-buddy/prayer-buddy.service';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const NOW = utc('2026-07-29');

const nextMeeting = {
  id: 'm1',
  date: utc('2026-08-04'),
  type: 'STANDARD',
  title: null,
  location: { id: 'loc-chris', name: 'Bei Chris', requiresHost: true },
  host: { id: 'chris', name: 'chris' },
  topic: {
    id: 't1',
    title: 'Vergebung',
    responsibles: [{ person: { id: 'antonia', name: 'Antonia' } }],
  },
  songLeaders: [{ person: { id: 'lena', name: 'Lena' } }],
  attendances: [] as { status: string }[],
};

const pastWithActionstep = {
  id: 'm0',
  date: utc('2026-07-28'),
  actionstepText: 'Jeden Tag 10 Minuten still werden',
  actionstepDone: [] as { personId: string }[],
};

function setup(
  options: {
    meeting?: typeof nextMeeting | null;
    actionstep?: {
      id: string;
      date: Date;
      actionstepText: string | null;
      actionstepDone: { personId: string }[];
    } | null;
    buddies?: {
      periodEnd: string;
      groups: { members: { id: string; name: string }[] }[];
    } | null;
    roles?: unknown[];
    peopleCount?: number;
  } = {},
) {
  // Two calls to meeting.findFirst: the next evening, then the last actionstep.
  const findFirst = jest
    .fn()
    .mockResolvedValueOnce(
      options.meeting === undefined ? nextMeeting : options.meeting,
    )
    .mockResolvedValueOnce(
      options.actionstep === undefined
        ? pastWithActionstep
        : options.actionstep,
    );

  const findAssignments = jest.fn().mockResolvedValue(options.roles ?? []);
  const findCurrent = jest.fn().mockResolvedValue(
    options.buddies === undefined
      ? {
          periodEnd: '2026-08-11',
          groups: [
            {
              members: [
                { id: 'niko', name: 'Niko' },
                { id: 'antonia', name: 'Antonia' },
              ],
            },
          ],
        }
      : options.buddies,
  );

  const service = new DashboardService(
    {
      meeting: { findFirst },
      person: { count: jest.fn().mockResolvedValue(options.peopleCount ?? 9) },
    } as unknown as PrismaService,
    { findAssignments } as unknown as AssignmentService,
    { findCurrent } as unknown as PrayerBuddyService,
  );

  return { service, findFirst, findAssignments };
}

describe('DashboardService.build', () => {
  it('puts the whole home screen together', async () => {
    const { service } = setup();

    const home = await service.build('hk-1', 'niko', { now: NOW });

    expect(home.nextMeeting).toMatchObject({
      id: 'm1',
      date: '2026-08-04',
      host: { name: 'chris' },
      topic: { title: 'Vergebung' },
    });
    // Alle drei Rollen mit Personen: das Thema hat oft keinen Titel, dann ist
    // „wer bereitet vor" das Einzige, was über den Abend etwas aussagt.
    expect(home.nextMeeting?.topic?.responsibles).toEqual([
      { id: 'antonia', name: 'Antonia' },
    ]);
    expect(home.nextMeeting?.songLeaders).toEqual([
      { id: 'lena', name: 'Lena' },
    ]);
    expect(home.openActionstep).toEqual({
      text: 'Jeden Tag 10 Minuten still werden',
      meetingId: 'm0',
      date: '2026-07-28',
      done: false,
      doneCount: 0,
      peopleCount: 9,
    });
    expect(home.prayerBuddies).toEqual({
      until: '2026-08-11',
      withNames: ['Antonia'],
    });
  });

  it('treats a missing attendance row as undecided', async () => {
    const { service } = setup();

    const home = await service.build('hk-1', 'niko', { now: NOW });

    // No row means nobody answered yet, which is exactly what UNKNOWN says.
    expect(home.nextMeeting?.myAttendance).toBe('UNKNOWN');
  });

  it('reports the answer that was given', async () => {
    const { service } = setup({
      meeting: { ...nextMeeting, attendances: [{ status: 'ABSENT' }] },
    });

    const home = await service.build('hk-1', 'niko', { now: NOW });

    expect(home.nextMeeting?.myAttendance).toBe('ABSENT');
  });

  it('copes with nothing planned', async () => {
    const { service } = setup({ meeting: null });

    const home = await service.build('hk-1', 'niko', { now: NOW });

    // A valid state, not an error — the generator may simply not have run yet.
    expect(home.nextMeeting).toBeNull();
  });

  it('counts who ticked the actionstep off, and whether you did', async () => {
    const { service } = setup({
      actionstep: {
        ...pastWithActionstep,
        actionstepDone: [{ personId: 'niko' }, { personId: 'chris' }],
      },
      peopleCount: 9,
    });

    const home = await service.build('hk-1', 'niko', { now: NOW });

    // „2 von 9 haben's geschafft" — und du bist eine davon.
    expect(home.openActionstep).toMatchObject({
      done: true,
      doneCount: 2,
      peopleCount: 9,
    });
  });

  it('shows no actionstep when the last ones had none', async () => {
    const { service } = setup({ actionstep: null });

    const home = await service.build('hk-1', 'niko', { now: NOW });

    expect(home.openActionstep).toBeNull();
  });

  it('treats a blank actionstep as none', async () => {
    const { service } = setup({
      actionstep: {
        id: 'm0',
        date: utc('2026-07-28'),
        actionstepText: '  ',
        actionstepDone: [],
      },
    });

    const home = await service.build('hk-1', 'niko', { now: NOW });

    expect(home.openActionstep).toBeNull();
  });

  it('stays quiet about buddies when this person is in no group', async () => {
    const { service } = setup({
      buddies: {
        periodEnd: '2026-08-11',
        groups: [{ members: [{ id: 'chris', name: 'chris' }] }],
      },
    });

    const home = await service.build('hk-1', 'niko', { now: NOW });

    expect(home.prayerBuddies).toBeNull();
  });

  it('leaves the prayer buddies out of the jobs list', async () => {
    const { service } = setup({
      roles: [
        { role: 'HOST', date: '2026-08-04', person: { id: 'niko' } },
        { role: 'PRAYER_BUDDY', date: '2026-08-12', person: { id: 'niko' } },
      ],
    });

    const home = await service.build('hk-1', 'niko', { now: NOW });

    // Mit jemandem zusammen beten ist keine Aufgabe, die man abarbeitet — und
    // es steht schon in `prayerBuddies`. In `…/assignments` bleibt es drin.
    expect(home.myRoles.map((role) => role.role)).toEqual(['HOST']);
  });

  it('asks only for that person, eight weeks out', async () => {
    const { service, findAssignments } = setup();

    await service.build('hk-1', 'niko', { now: NOW });

    expect(findAssignments).toHaveBeenCalledWith('hk-1', {
      from: utc('2026-07-29'),
      to: utc('2026-09-23'),
      personId: 'niko',
    });
  });

  it('uses the same actionstep rule as the reminder', async () => {
    const { service, findFirst } = setup();

    await service.build('hk-1', 'niko', { now: NOW });

    // Most recent past evening that has one — not simply the last evening.
    const where = findFirst.mock.calls[1][0].where;
    expect(where.date).toEqual({ lt: utc('2026-07-29') });
    expect(where.actionstepText).toEqual({ not: null });
    expect(findFirst.mock.calls[1][0].orderBy).toEqual({ date: 'desc' });
  });
});
