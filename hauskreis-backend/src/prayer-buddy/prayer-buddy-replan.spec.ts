/**
 * Was passiert, wenn sich die Gruppe ändert.
 *
 * Bis hierher war die Teilnehmerliste eine Momentaufnahme: gelesen wurde sie
 * beim Bauen einer Runde und danach nie wieder. Wer ging, stand noch in fünf
 * geplanten Runden; wer kam, wartete zehn Wochen.
 *
 * Ein kleiner echter Speicher statt einzelner Mock-Rückgaben — Reparatur,
 * Verwerfen und Nachplanen greifen ineinander, und geprüft werden soll, was am
 * Ende dasteht, nicht welche Aufrufe passiert sind.
 */
import { PrayerBuddyGeneratorService } from './prayer-buddy-generator.service';
// Type-only: keeps Jest from loading the real PrismaClient and web-push.
import type { PrismaService } from '../prisma/prisma.service';
import type { PrayerBuddyService } from './prayer-buddy.service';
import type { NotificationService } from '../notification/notification.service';
import { withClock } from '../meeting/group-clock.testing';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);
const DAY = 86_400_000;
const shift = (date: Date, days: number) =>
  new Date(date.getTime() + days * DAY);

const TODAY = utc('2026-08-04');
const RUNS_UNTIL = utc('2026-08-17');

interface GroupRow {
  id: string;
  periodStart: Date;
  periodEnd: Date;
  discardedAt: Date | null;
  memberIds: string[];
}

/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma-Argumente nachzubauen wäre mehr Typ als Test. */

function matches(row: GroupRow, where: Record<string, any> = {}): boolean {
  if (where.discardedAt === null && row.discardedAt !== null) return false;
  if (where.id?.in && !where.id.in.includes(row.id)) return false;

  const start = where.periodStart ?? {};
  const end = where.periodEnd ?? {};

  if (start.lte && row.periodStart > start.lte) return false;
  if (start.gte && row.periodStart < start.gte) return false;
  if (start.gt && row.periodStart <= start.gt) return false;
  if (end.gte && row.periodEnd < end.gte) return false;
  if (end.lt && row.periodEnd >= end.lt) return false;

  return true;
}

function setup(options: {
  /** Die laufende Runde, als Liste von Besetzungen. */
  running?: string[][];
  /** Wie viele künftige Runden schon geplant sind. */
  plannedAhead?: number;
  /** Wer jetzt noch aktiv ist. */
  active: string[];
}) {
  let seq = 0;
  const rows: GroupRow[] = [];

  for (const memberIds of options.running ?? []) {
    rows.push({
      id: `run-${(seq += 1)}`,
      periodStart: utc('2026-08-04'),
      periodEnd: RUNS_UNTIL,
      discardedAt: null,
      memberIds: [...memberIds],
    });
  }

  for (let round = 1; round <= (options.plannedAhead ?? 0); round += 1) {
    rows.push({
      id: `ahead-${round}`,
      periodStart: shift(RUNS_UNTIL, (round - 1) * 14 + 1),
      periodEnd: shift(RUNS_UNTIL, round * 14),
      discardedAt: null,
      // Wen sie enthalten, ist gleichgültig: sie werden ohnehin verworfen.
      memberIds: [...options.active],
    });
  }

  const find = (args: any) => {
    const hits = rows.filter((row) => matches(row, args.where));
    const [field, direction] = Object.entries(args.orderBy ?? {})[0] ?? [];

    if (field === 'periodStart' || field === 'periodEnd') {
      hits.sort(
        (a, b) =>
          (a[field].getTime() - b[field].getTime()) *
          (direction === 'asc' ? 1 : -1),
      );
    }

    return hits;
  };

  const logDeletes: any[] = [];

  const prisma = {
    prayerBuddyGroup: {
      findMany: jest.fn(async (args: any) =>
        find(args).map((row) => ({
          ...row,
          members: row.memberIds.map((personId) => ({ personId })),
        })),
      ),
      findFirst: jest.fn(async (args: any) => find(args)[0] ?? null),
      groupBy: jest.fn(async (args: any) =>
        [
          ...new Set(
            rows
              .filter((row) => matches(row, args.where))
              .map((row) => +row.periodStart),
          ),
        ].map((time) => ({ periodStart: new Date(time) })),
      ),
      create: jest.fn(async (args: any) => {
        const row: GroupRow = {
          id: `new-${(seq += 1)}`,
          periodStart: args.data.periodStart,
          periodEnd: args.data.periodEnd,
          discardedAt: null,
          memberIds: (args.data.members?.create ?? []).map(
            (member: any) => member.personId,
          ),
        };
        rows.push(row);
        return row;
      }),
      deleteMany: jest.fn(async (args: any) => {
        const hits = rows.filter((row) => matches(row, args.where));
        for (const hit of hits) rows.splice(rows.indexOf(hit), 1);
        return { count: hits.length };
      }),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    prayerBuddyGroupMember: {
      create: jest.fn(async (args: any) => {
        const row = rows.find(
          (candidate) => candidate.id === args.data.groupId,
        );
        row?.memberIds.push(args.data.personId);
        return args.data;
      }),
      deleteMany: jest.fn(async (args: any) => {
        const row = rows.find(
          (candidate) => candidate.id === args.where.groupId,
        );
        const personIds: string[] = args.where.personId.in;
        if (row) {
          row.memberIds = row.memberIds.filter((id) => !personIds.includes(id));
        }
        return { count: personIds.length };
      }),
    },
    person: {
      findMany: jest.fn(async () =>
        options.active.map((id) => ({ id, name: id.toUpperCase() })),
      ),
    },
    notificationLog: {
      deleteMany: jest.fn(async (args: any) => {
        logDeletes.push(args.where);
        return { count: 0 };
      }),
    },
    // Prisma führt das Array der Reihe nach aus; die Fakes sind schon Promises.
    $transaction: jest.fn((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  } as unknown as PrismaService;

  const buddies = {
    findCurrent: jest.fn(async (_hauskreisId: string, on = new Date()) => {
      const day = utc(iso(on));
      const covering = rows.filter(
        (row) =>
          row.discardedAt === null &&
          row.periodStart <= day &&
          row.periodEnd >= day,
      );

      if (covering.length === 0) return null;

      return {
        periodStart: iso(covering[0].periodStart),
        periodEnd: iso(covering[0].periodEnd),
        groups: covering.map((row) => ({
          id: row.id,
          members: row.memberIds.map((id) => ({ id, name: id.toUpperCase() })),
        })),
      };
    }),
    getConfig: jest.fn().mockResolvedValue({ periodLengthWeeks: 2 }),
    findHistory: jest.fn(async () => ({
      nextPeriodIndex: rows.length,
      groupings: [],
    })),
    periodEndFor: jest.fn((start: Date, weeks: number) =>
      shift(start, weeks * 7 - 1),
    ),
  } as unknown as PrayerBuddyService;

  const notify = jest
    .fn()
    .mockResolvedValue({ delivered: 1, pruned: 0, failed: 0, skipped: 0 });

  const service = withClock(
    new PrayerBuddyGeneratorService(prisma, buddies, {
      notify,
    } as unknown as NotificationService),
  );

  /** Die Besetzung der laufenden Runde, jede Gruppe sortiert. */
  const runningNow = () =>
    rows
      .filter((row) => row.periodStart <= TODAY && row.periodEnd >= TODAY)
      .map((row) => row.memberIds.toSorted());

  const future = () => rows.filter((row) => row.periodStart > TODAY);

  return { service, rows, notify, runningNow, future, logDeletes };
}

describe('PrayerBuddyGeneratorService.replanAfterMembershipChange', () => {
  it('nimmt die gegangene Person aus der laufenden Runde', async () => {
    const { service, runningNow } = setup({
      running: [
        ['a', 'b'],
        ['c', 'd'],
        ['e', 'f', 'g'],
      ],
      active: ['a', 'c', 'd', 'e', 'f', 'g'],
    });

    await service.replanAfterMembershipChange('hk-1', { now: TODAY });

    expect(runningNow().flat()).not.toContain('b');
    // Und die Gruppen, die nichts damit zu tun hatten, bleiben, wie sie waren.
    expect(runningNow()).toContainEqual(['e', 'f', 'g']);
  });

  it('lässt niemanden allein zurück', async () => {
    const { service, runningNow } = setup({
      running: [
        ['a', 'b'],
        ['c', 'd'],
      ],
      active: ['a', 'c', 'd'],
    });

    await service.replanAfterMembershipChange('hk-1', { now: TODAY });

    // Die leer gewordene Gruppe verschwindet ganz, statt als Karteileiche im
    // Archiv zu stehen.
    expect(runningNow()).toEqual([['a', 'c', 'd']]);
  });

  it('holt einen Neuzugang sofort in die laufende Runde', async () => {
    const { service, runningNow } = setup({
      running: [
        ['a', 'b'],
        ['c', 'd', 'e'],
      ],
      active: ['a', 'b', 'c', 'd', 'e', 'neu'],
    });

    await service.replanAfterMembershipChange('hk-1', { now: TODAY });

    expect(runningNow()).toContainEqual(['a', 'b', 'neu']);
  });

  it('benachrichtigt nur die Gruppe, in der sich etwas geändert hat', async () => {
    const { service, notify } = setup({
      running: [
        ['a', 'b'],
        ['c', 'd'],
        ['e', 'f'],
      ],
      active: ['a', 'c', 'd', 'e', 'f'],
    });

    await service.replanAfterMembershipChange('hk-1', { now: TODAY });

    // `a` zieht zu `c` und `d`; `e` und `f` merken nichts und hören nichts.
    const told = notify.mock.calls.map((call) => call[0].personId).toSorted();
    expect(told).toEqual(['a', 'c', 'd']);
  });

  it('räumt den Merkposten weg, sonst käme die zweite Nachricht nie an', async () => {
    const { service, logDeletes } = setup({
      running: [
        ['a', 'b'],
        ['c', 'd'],
      ],
      active: ['a', 'c', 'd'],
    });

    await service.replanAfterMembershipChange('hk-1', { now: TODAY });

    // `hasBeenSent` prüft auf (Person, Art, Gruppe) — alle drei unverändert.
    expect(logDeletes[0]).toEqual({
      type: 'PRAYER_BUDDY_ASSIGNED',
      relatedGroupId: { in: ['run-2'] },
    });
  });

  it('kann still nachziehen', async () => {
    const { service, notify } = setup({
      running: [['a', 'b']],
      active: ['a', 'c'],
    });

    await service.replanAfterMembershipChange('hk-1', {
      now: TODAY,
      notify: false,
    });

    expect(notify).not.toHaveBeenCalled();
  });

  it('verwirft die geplanten Runden und plant neu', async () => {
    const { service, future } = setup({
      running: [
        ['a', 'b'],
        ['c', 'd'],
      ],
      plannedAhead: 4,
      active: ['a', 'c', 'd'],
    });

    const result = await service.replanAfterMembershipChange('hk-1', {
      now: TODAY,
    });

    expect(result.discarded).toBe(4);
    // Der Vorlauf steht danach wieder voll da — mit frischen Zeilen.
    expect(future()).toHaveLength(4);
    expect(future().every((row) => row.id.startsWith('new-'))).toBe(true);
  });

  /**
   * Gelöscht statt `discardedAt`, anders als beim Neuwürfeln von Hand: diese
   * Paarungen haben nie stattgefunden. Blieben sie stehen, mieden sich zwei
   * Menschen wegen einer Runde, die keiner von beiden erlebt hat.
   */
  it('behält die verworfenen Runden nicht als Historie', async () => {
    const { service, rows } = setup({
      running: [['a', 'b']],
      plannedAhead: 2,
      active: ['a', 'b'],
    });

    await service.replanAfterMembershipChange('hk-1', { now: TODAY });

    expect(rows.some((row) => row.id.startsWith('ahead-'))).toBe(false);
  });

  it('plant auch dann, wenn gerade keine Runde läuft', async () => {
    const { service, future } = setup({ active: ['a', 'b'] });

    const result = await service.replanAfterMembershipChange('hk-1', {
      now: TODAY,
    });

    expect(result.repaired).toBe(0);
    expect(result.planned).toBeGreaterThan(0);
    expect(future().length).toBeGreaterThan(0);
  });

  it('lässt die Runde still enden, wenn nur eine Person übrig ist', async () => {
    const { service, runningNow, notify } = setup({
      running: [['a', 'b']],
      active: ['a'],
    });

    await service.replanAfterMembershipChange('hk-1', { now: TODAY });

    // Eine Gruppe aus einem Menschen wäre eine Behauptung — und eine Nachricht
    // darüber, mit wem man betet, hätte keinen Inhalt.
    expect(runningNow()).toEqual([]);
    expect(notify).not.toHaveBeenCalled();
  });
});
