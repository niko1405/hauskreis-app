import { PrayerBuddyGeneratorService } from './prayer-buddy-generator.service';
// Type-only: keeps Jest from loading the real PrismaClient and web-push.
import type { PrismaService } from '../prisma/prisma.service';
import type { PrayerBuddyService } from './prayer-buddy.service';
import type { NotificationService } from '../notification/notification.service';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const TODAY = utc('2026-07-29');

const assignment = {
  periodStart: '2026-07-29',
  periodEnd: '2026-08-11',
  groups: [
    {
      id: 'g1',
      members: [
        { id: 'a', name: 'Anna' },
        { id: 'b', name: 'Ben' },
      ],
    },
  ],
};

function setup(running: { id: string; periodStart: Date }[] = []) {
  const findMany = jest.fn().mockResolvedValue(running);
  const updateMany = jest.fn().mockResolvedValue({ count: running.length });
  const create = jest.fn();

  const prisma = {
    prayerBuddyGroup: { findMany, updateMany, create },
    person: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'a', name: 'Anna' },
        { id: 'b', name: 'Ben' },
      ]),
    },
    hauskreis: { findMany: jest.fn().mockResolvedValue([{ id: 'hk-1' }]) },
    $transaction: jest.fn().mockResolvedValue([]),
  } as unknown as PrismaService;

  const findCurrent = jest.fn().mockResolvedValue(assignment);
  const buddies = {
    findCurrent,
    getConfig: jest.fn().mockResolvedValue({ periodLengthWeeks: 2 }),
    findHistory: jest
      .fn()
      .mockResolvedValue({ nextPeriodIndex: 0, groupings: [] }),
    periodEndFor: jest.fn().mockReturnValue(utc('2026-08-11')),
  } as unknown as PrayerBuddyService;

  const notify = jest
    .fn()
    .mockResolvedValue({ delivered: 1, pruned: 0, failed: 0, skipped: 0 });

  const service = new PrayerBuddyGeneratorService(prisma, buddies, {
    notify,
  } as unknown as NotificationService);

  return { service, findMany, updateMany, findCurrent, notify, prisma };
}

describe('PrayerBuddyGeneratorService.ensureCurrentAssignment', () => {
  it('leaves a running assignment alone', async () => {
    const { service, notify } = setup();

    const result = await service.ensureCurrentAssignment('hk-1', TODAY);

    expect(result.created).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });

  it('assigns when nobody is covered today', async () => {
    const { service, findCurrent, notify } = setup();
    findCurrent.mockResolvedValueOnce(null);

    const result = await service.ensureCurrentAssignment('hk-1', TODAY);

    expect(result.created).toBe(true);
    expect(result.notified).toBe(2);
    expect(notify).toHaveBeenCalledTimes(2);
  });
});

describe('PrayerBuddyGeneratorService.rotateNow', () => {
  it('discards an assignment that only started today', async () => {
    const { service, updateMany } = setup([
      { id: 'old-1', periodStart: TODAY },
    ]);

    await service.rotateNow('hk-1', { now: TODAY, notify: false });

    // Marked, not deleted: the next roll has to know this split was rejected,
    // or the deterministic algorithm hands back exactly the same one.
    expect(updateMany.mock.calls[0][0].data.discardedAt).toBeInstanceOf(Date);
    expect(updateMany.mock.calls[0][0].data.periodEnd).toBeUndefined();
  });

  it('closes off an assignment that has been running', async () => {
    const { service, updateMany } = setup([
      { id: 'old-1', periodStart: utc('2026-07-20') },
    ]);

    await service.rotateNow('hk-1', { now: TODAY, notify: false });

    // Those days did happen, so it keeps its place in the archive and ends
    // yesterday rather than being wiped.
    expect(updateMany.mock.calls[0][0].data.periodEnd).toEqual(
      utc('2026-07-28'),
    );
    expect(updateMany.mock.calls[0][0].data.discardedAt).toBeUndefined();
  });

  it('rotates from nothing without touching anything', async () => {
    const { service, updateMany } = setup([]);

    const result = await service.rotateNow('hk-1', {
      now: TODAY,
      notify: false,
    });

    expect(updateMany).not.toHaveBeenCalled();
    expect(result.created).toBe(true);
  });

  it('can rotate quietly', async () => {
    const { service, notify } = setup([]);

    const result = await service.rotateNow('hk-1', {
      now: TODAY,
      notify: false,
    });

    expect(notify).not.toHaveBeenCalled();
    expect(result.notified).toBe(0);
  });

  it('only looks at assignments that are not already discarded', async () => {
    const { service, findMany } = setup([]);

    await service.rotateNow('hk-1', { now: TODAY, notify: false });

    expect(findMany.mock.calls[0][0].where.discardedAt).toBeNull();
  });
});
