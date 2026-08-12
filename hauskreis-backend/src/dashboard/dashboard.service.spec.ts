import { DashboardService } from './dashboard.service';
// Type-only imports keep Jest from loading the real PrismaClient.
import type { PrismaService } from '../prisma/prisma.service';
import type { AssignmentService } from './assignment.service';
import type { PrayerBuddyService } from '../prayer-buddy/prayer-buddy.service';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const NOW = utc('2026-07-29');

/** Wer den Startbildschirm aufmacht. Niko ist nicht fürs Thema zugeteilt. */
const NIKO = { personId: 'niko', isAdmin: false };
/** Antonia schon — sie sieht den Titel auch vor dem Abend. */
const ANTONIA = { personId: 'antonia', isAdmin: false };

const nextMeeting = {
  id: 'm1',
  date: utc('2026-08-04'),
  type: 'STANDARD',
  title: null,
  location: { id: 'loc-chris', name: 'Bei Chris', requiresHost: true },
  host: { id: 'chris', name: 'chris' },
  topicResponsibles: [{ person: { id: 'antonia', name: 'Antonia' } }],
  // So kommt die Einheit aus Prisma — `shapeSessionForMeeting` macht daraus
  // das, was der Betrachter sehen darf.
  topicSession: {
    id: 's1',
    topicId: 't1',
    meetingId: 'm1',
    title: null,
    actionstepText: null,
    summaryText: null,
    createdAt: utc('2026-07-01'),
    updatedAt: utc('2026-07-01'),
    version: 0,
    meeting: {
      id: 'm1',
      date: utc('2026-08-04'),
      status: 'PLANNED',
      title: null,
      topicResponsibles: [{ personId: 'antonia' }],
    },
    responsibles: [],
    topic: {
      id: 't1',
      title: 'Vergebung',
      status: 'RUNNING',
      ownerPersonId: 'antonia',
      collaborators: [],
      // Die Geschwister — daraus wird „Session 1 von 1".
      sessions: [{ id: 's1', meeting: { date: utc('2026-08-04') } }],
    },
  },
  songLeaders: [{ person: { id: 'lena', name: 'Lena' } }],
  attendances: [] as { status: string }[],
};

const pastWithActionstep = {
  id: 'm0',
  date: utc('2026-07-28'),
  topicSession: { actionstepText: 'Jeden Tag 10 Minuten still werden' },
  actionstepDone: [] as { personId: string }[],
};

function setup(
  options: {
    meeting?: typeof nextMeeting | null;
    actionstep?: {
      id: string;
      date: Date;
      topicSession: { actionstepText: string | null } | null;
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

    const home = await service.build('hk-1', NIKO, { now: NOW });

    expect(home.nextMeeting).toMatchObject({
      id: 'm1',
      date: '2026-08-04',
      // Als Zahl — das Antwort-Schema macht daraus `"18:00"`. Ohne sie musste
      // man den Termin öffnen, um eine Uhrzeit zu sehen, die sich einstellen
      // lässt.
      startTime: 1080,
      host: { name: 'chris' },
    });
    // Alle drei Rollen mit Personen: das Thema hat oft keinen Titel, dann ist
    // „wer bereitet vor" das Einzige, was über den Abend etwas aussagt.
    expect(home.nextMeeting?.topicResponsibles).toEqual([
      { id: 'antonia', name: 'Antonia' },
    ]);
    // Der Titel gehört bis zum Abend denen, die ihn vorbereiten — Niko ist
    // nicht dabei, für ihn steht dort nichts. Siehe den Test darunter.
    expect(home.nextMeeting?.topic).toBeNull();
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

    const home = await service.build('hk-1', NIKO, { now: NOW });

    // No row means nobody answered yet, which is exactly what UNKNOWN says.
    expect(home.nextMeeting?.myAttendance).toBe('UNKNOWN');
  });

  it('reports the answer that was given', async () => {
    const { service } = setup({
      meeting: { ...nextMeeting, attendances: [{ status: 'ABSENT' }] },
    });

    const home = await service.build('hk-1', NIKO, { now: NOW });

    expect(home.nextMeeting?.myAttendance).toBe('ABSENT');
  });

  it('copes with nothing planned', async () => {
    const { service } = setup({ meeting: null });

    const home = await service.build('hk-1', NIKO, { now: NOW });

    // A valid state, not an error — the generator may simply not have run yet.
    expect(home.nextMeeting).toBeNull();
  });

  /**
   * Die Abendregel auf dem Startbildschirm: derselbe Aufruf, zwei Antworten.
   * Wer vorbereitet, sieht sein Thema jederzeit.
   */
  it('zeigt der Zuständigen ihr Thema schon vorher', async () => {
    const { service } = setup();

    const home = await service.build('hk-1', ANTONIA, { now: NOW });

    expect(home.nextMeeting?.topic).toEqual({ id: 't1', title: 'Vergebung' });
  });

  it('counts who ticked the actionstep off, and whether you did', async () => {
    const { service } = setup({
      actionstep: {
        ...pastWithActionstep,
        actionstepDone: [{ personId: 'niko' }, { personId: 'chris' }],
      },
      peopleCount: 9,
    });

    const home = await service.build('hk-1', NIKO, { now: NOW });

    // „2 von 9 haben's geschafft" — und du bist eine davon.
    expect(home.openActionstep).toMatchObject({
      done: true,
      doneCount: 2,
      peopleCount: 9,
    });
  });

  it('shows no actionstep when the last ones had none', async () => {
    const { service } = setup({ actionstep: null });

    const home = await service.build('hk-1', NIKO, { now: NOW });

    expect(home.openActionstep).toBeNull();
  });

  it('treats a blank actionstep as none', async () => {
    const { service } = setup({
      actionstep: {
        id: 'm0',
        date: utc('2026-07-28'),
        hasTopicSlot: true,
        actionstepText: null,
        topicSession: { actionstepText: '  ' },
        actionstepDone: [],
      },
    });

    const home = await service.build('hk-1', NIKO, { now: NOW });

    expect(home.openActionstep).toBeNull();
  });

  it('stays quiet about buddies when this person is in no group', async () => {
    const { service } = setup({
      buddies: {
        periodEnd: '2026-08-11',
        groups: [{ members: [{ id: 'chris', name: 'chris' }] }],
      },
    });

    const home = await service.build('hk-1', NIKO, { now: NOW });

    expect(home.prayerBuddies).toBeNull();
  });

  it('leaves the prayer buddies out of the jobs list', async () => {
    const { service } = setup({
      roles: [
        { role: 'HOST', date: '2026-08-04', person: { id: 'niko' } },
        { role: 'PRAYER_BUDDY', date: '2026-08-12', person: { id: 'niko' } },
      ],
    });

    const home = await service.build('hk-1', NIKO, { now: NOW });

    // Mit jemandem zusammen beten ist keine Aufgabe, die man abarbeitet — und
    // es steht schon in `prayerBuddies`. In `…/assignments` bleibt es drin.
    expect(home.myRoles.map((role) => role.role)).toEqual(['HOST']);
  });

  it('asks only for that person, eight weeks out', async () => {
    const { service, findAssignments } = setup();

    await service.build('hk-1', NIKO, { now: NOW });

    expect(findAssignments).toHaveBeenCalledWith('hk-1', {
      from: utc('2026-07-29'),
      to: utc('2026-09-23'),
      personId: 'niko',
    });
  });

  it('uses the same actionstep rule as the reminder', async () => {
    const { service, findFirst } = setup();

    await service.build('hk-1', NIKO, { now: NOW });

    // Most recent past evening that has one — not simply the last evening.
    const where = findFirst.mock.calls[1][0].where;
    expect(where.date).toEqual({ lt: utc('2026-07-29') });
    // Der Actionstep steht an der Einheit, die an dem Abend hing.
    expect(where.topicSession).toEqual({ actionstepText: { not: null } });
    expect(findFirst.mock.calls[1][0].orderBy).toEqual({ date: 'desc' });
  });
});
