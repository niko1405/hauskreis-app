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
  location: { id: 'loc-chris', name: 'Bei Chris' },
  host: { id: 'chris', name: 'chris' },
  topic: { id: 't1', title: 'Vergebung' },
  attendances: [] as { status: string }[],
};

const pastWithActionstep = {
  id: 'm0',
  date: utc('2026-07-28'),
  actionstepText: 'Jeden Tag 10 Minuten still werden',
};

function setup(
  options: {
    meeting?: typeof nextMeeting | null;
    actionstep?: {
      id: string;
      date: Date;
      actionstepText: string | null;
    } | null;
    buddies?: {
      periodEnd: string;
      groups: { members: { id: string; name: string }[] }[];
    } | null;
    roles?: unknown[];
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
    { meeting: { findFirst } } as unknown as PrismaService,
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
    expect(home.openActionstep).toEqual({
      text: 'Jeden Tag 10 Minuten still werden',
      meetingId: 'm0',
      date: '2026-07-28',
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

  it('shows no actionstep when the last ones had none', async () => {
    const { service } = setup({ actionstep: null });

    const home = await service.build('hk-1', 'niko', { now: NOW });

    expect(home.openActionstep).toBeNull();
  });

  it('treats a blank actionstep as none', async () => {
    const { service } = setup({
      actionstep: { id: 'm0', date: utc('2026-07-28'), actionstepText: '  ' },
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
