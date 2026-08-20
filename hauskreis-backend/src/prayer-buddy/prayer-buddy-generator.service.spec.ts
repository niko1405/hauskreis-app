import {
  PrayerBuddyGeneratorService,
  ROUNDS_AHEAD,
} from './prayer-buddy-generator.service';
// Type-only: keeps Jest from loading the real PrismaClient and web-push.
import type { PrismaService } from '../prisma/prisma.service';
import type { PrayerBuddyService } from './prayer-buddy.service';
import type { NotificationService } from '../notification/notification.service';
import { withClock } from '../meeting/group-clock.testing';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const TODAY = utc('2026-07-29');
const DAY = 86_400_000;

const shift = (date: Date, days: number) =>
  new Date(date.getTime() + days * DAY);
const iso = (date: Date) => date.toISOString().slice(0, 10);

interface Row {
  id: string;
  periodStart: Date;
  periodEnd: Date;
  discardedAt: Date | null;
}

const PEOPLE = [
  { id: 'a', name: 'Anna' },
  { id: 'b', name: 'Ben' },
];

/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma-Argumente nachzubauen wäre mehr Typ als Test. */

/** Nur die Filter, die der Dienst tatsächlich schickt. */
function matches(row: Row, where: Record<string, any> = {}): boolean {
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

function sorted(list: Row[], orderBy?: Record<string, 'asc' | 'desc'>): Row[] {
  if (!orderBy) return [...list];

  const [field, direction] = Object.entries(orderBy)[0] as [
    'periodStart' | 'periodEnd',
    'asc' | 'desc',
  ];

  return [...list].toSorted(
    (a, b) =>
      (a[field].getTime() - b[field].getTime()) *
      (direction === 'asc' ? 1 : -1),
  );
}

/**
 * Ein kleiner echter Speicher statt einzelner Mock-Rückgaben.
 *
 * Fünf Runden im Voraus, das Vorziehen und das Nachfüllen sind Abläufe über
 * mehrere Abfragen hinweg — mit `mockResolvedValueOnce` ließe sich davon nur
 * prüfen, dass bestimmte Aufrufe passieren, nicht, dass am Ende die richtigen
 * Zeiträume dastehen.
 */
function fakeStore(initial: Partial<Row>[] = [], people = PEOPLE) {
  let seq = 0;
  const rows: Row[] = initial.map((row) => ({
    id: row.id ?? `seed-${(seq += 1)}`,
    periodStart: row.periodStart as Date,
    periodEnd: row.periodEnd as Date,
    discardedAt: row.discardedAt ?? null,
  }));

  const find = (args: any) =>
    sorted(
      rows.filter((row) => matches(row, args.where)),
      args.orderBy,
    );

  const prayerBuddyGroup = {
    findMany: jest.fn(async (args: any) => find(args)),
    findFirst: jest.fn(async (args: any) => find(args)[0] ?? null),
    groupBy: jest.fn(async (args: any) => {
      const keys = new Set(
        rows
          .filter((row) => matches(row, args.where))
          .map((row) => iso(row.periodStart)),
      );
      return [...keys].map((key) => ({ periodStart: utc(key) }));
    }),
    updateMany: jest.fn(async (args: any) => {
      const hits = rows.filter((row) => matches(row, args.where));
      for (const row of hits) Object.assign(row, args.data);
      return { count: hits.length };
    }),
    update: jest.fn(async (args: any) => {
      const row = rows.find(
        (candidate) => candidate.id === args.where.id,
      ) as Row;
      Object.assign(row, args.data);
      return row;
    }),
    create: jest.fn(async (args: any) => {
      const row: Row = {
        id: `g-${(seq += 1)}`,
        periodStart: args.data.periodStart,
        periodEnd: args.data.periodEnd,
        discardedAt: null,
      };
      rows.push(row);
      return row;
    }),
  };

  const prisma = {
    prayerBuddyGroup,
    person: { findMany: jest.fn().mockResolvedValue(people) },
    hauskreis: { findMany: jest.fn().mockResolvedValue([{ id: 'hk-1' }]) },
    $transaction: jest.fn((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  } as unknown as PrismaService;

  return { prisma, rows, prayerBuddyGroup };
}

function setup(initial: Partial<Row>[] = [], people = PEOPLE) {
  const { prisma, rows, prayerBuddyGroup } = fakeStore(initial, people);

  const findCurrent = jest.fn(async (_hauskreisId: string, on = new Date()) => {
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
      groups: covering.map((row) => ({ id: row.id, members: people })),
    };
  });

  const buddies = {
    findCurrent,
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

  /** Die Zeiträume, die noch laufen oder kommen — in Reihenfolge. */
  const upcoming = () =>
    rows
      .filter((row) => row.discardedAt === null && row.periodEnd >= TODAY)
      .toSorted((a, b) => a.periodStart.getTime() - b.periodStart.getTime())
      .map((row) => `${iso(row.periodStart)}…${iso(row.periodEnd)}`);

  return { service, rows, notify, upcoming, prayerBuddyGroup, prisma };
}

describe('PrayerBuddyGeneratorService.ensureRoundsPlanned', () => {
  it('plans five rounds back to back from nothing', async () => {
    const { service, upcoming } = setup();

    const result = await service.ensureRoundsPlanned('hk-1', TODAY);

    expect(result.created).toBe(ROUNDS_AHEAD);
    // Lückenlos, jede zwei Wochen: die nächste beginnt am Tag nach der letzten.
    expect(upcoming()).toEqual([
      '2026-07-29…2026-08-11',
      '2026-08-12…2026-08-25',
      '2026-08-26…2026-09-08',
      '2026-09-09…2026-09-22',
      '2026-09-23…2026-10-06',
    ]);
  });

  it('tops up instead of starting over', async () => {
    const { service, upcoming } = setup([
      { periodStart: utc('2026-07-22'), periodEnd: utc('2026-08-04') },
    ]);

    const result = await service.ensureRoundsPlanned('hk-1', TODAY);

    expect(result.created).toBe(ROUNDS_AHEAD - 1);
    expect(upcoming()[0]).toBe('2026-07-22…2026-08-04');
  });

  it('does nothing when the plan is already full', async () => {
    const { service } = setup();
    await service.ensureRoundsPlanned('hk-1', TODAY);

    const again = await service.ensureRoundsPlanned('hk-1', TODAY);

    expect(again.created).toBe(0);
  });

  it('says nothing while planning ahead', async () => {
    const { service, notify } = setup();

    await service.ensureRoundsPlanned('hk-1', TODAY);

    // Wer im Juli erfährt, mit wem er im Oktober betet, hat keine Erinnerung
    // bekommen, sondern Lärm.
    expect(notify).not.toHaveBeenCalled();
  });

  it('starts today after a gap instead of back-filling', async () => {
    const { service, rows } = setup([
      { periodStart: utc('2026-05-01'), periodEnd: utc('2026-05-14') },
    ]);

    await service.ensureRoundsPlanned('hk-1', TODAY);

    // Der Server war zwei Monate aus. Runden nachzutragen, die niemand erlebt
    // hat, wäre erfundene Geschichte.
    const fresh = rows.filter((row) => row.periodStart >= TODAY);
    expect(iso(fresh[0].periodStart)).toBe('2026-07-29');
  });

  it('gives up quietly when there is nobody to pair', async () => {
    const { service, rows } = setup([], [{ id: 'a', name: 'Anna' }]);

    const result = await service.ensureRoundsPlanned('hk-1', TODAY);

    // Eine Person allein lässt sich nicht verkuppeln. Kein Fehler — aber auch
    // kein Grund, es viermal weiter zu versuchen.
    expect(result.created).toBe(0);
    expect(rows).toHaveLength(0);
  });

  /**
   * Wer eingeladen ist, ist noch nicht da.
   *
   * Eine offene Einladung ist von der ersten Sekunde an `active: true` — die
   * Zeile entsteht beim Einladen. Stand sie damit in der Rotation, bekam ihr
   * Gegenüber einen Namen genannt, dem es nicht schreiben konnte, und betete
   * zwei Wochen allein. Hier wird deshalb die Abfrage selbst geprüft: Die
   * Bedingung ist das ganze Verhalten, und sie fällt beim Umbauen leicht
   * heraus.
   */
  it('lässt offene Einladungen aus der Rotation', async () => {
    const { service, prisma } = setup();

    await service.ensureRoundsPlanned('hk-1', TODAY);

    expect(prisma.person.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          hauskreisId: 'hk-1',
          active: true,
          acceptedAt: { not: null },
        }),
      }),
    );
  });
});

describe('PrayerBuddyGeneratorService.announceCurrentRound', () => {
  it('announces the round that is running', async () => {
    const { service, notify } = setup([
      { periodStart: TODAY, periodEnd: utc('2026-08-11') },
    ]);

    const notified = await service.announceCurrentRound('hk-1', TODAY);

    expect(notified).toBe(2);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('stays quiet when nobody is assigned', async () => {
    const { service, notify } = setup();

    expect(await service.announceCurrentRound('hk-1', TODAY)).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('points at the screen that exists', async () => {
    const { service, notify } = setup([
      { periodStart: TODAY, periodEnd: utc('2026-08-11') },
    ]);

    await service.announceCurrentRound('hk-1', TODAY);

    expect(notify.mock.calls[0][0].payload.url).toBe('/gebet');
  });
});

describe('PrayerBuddyGeneratorService.rotateNow', () => {
  it('pulls the next planned round forward and refills behind it', async () => {
    const { service, rows, upcoming } = setup();
    await service.ensureRoundsPlanned('hk-1', TODAY);

    const running = () =>
      rows.find(
        (row) =>
          row.discardedAt === null &&
          row.periodStart <= TODAY &&
          row.periodEnd >= TODAY,
      ) as Row;
    const wasRunning = running().id;
    const wasNext = rows
      .filter((row) => row.periodStart > TODAY)
      .toSorted((a, b) => a.periodStart.getTime() - b.periodStart.getTime())[0];

    const result = await service.rotateNow('hk-1', {
      now: TODAY,
      notify: false,
    });

    // Es läuft eine *andere* Gruppe — und zwar genau die, die als Nächste
    // geplant war. Nicht neu gewürfelt: sie wurde aus derselben Historie
    // gegen dieselben Leute gebaut, ein frischer Wurf käme fast gleich heraus.
    expect(result.created).toBe(true);
    expect(running().id).not.toBe(wasRunning);
    expect(running().id).toBe(wasNext.id);

    // Der Plan rutscht als Ganzes nach vorn und steht danach wieder voll da.
    expect(upcoming()).toEqual([
      '2026-07-29…2026-08-11',
      '2026-08-12…2026-08-25',
      '2026-08-26…2026-09-08',
      '2026-09-09…2026-09-22',
      '2026-09-23…2026-10-06',
    ]);
  });

  it('discards an assignment that only started today', async () => {
    const { service, rows } = setup([
      { id: 'old', periodStart: TODAY, periodEnd: utc('2026-08-11') },
    ]);

    await service.rotateNow('hk-1', { now: TODAY, notify: false });

    // Markiert, nicht gelöscht: der nächste Wurf muss wissen, dass diese
    // Aufteilung abgelehnt wurde, sonst liefert er deterministisch dieselbe.
    const old = rows.find((row) => row.id === 'old') as Row;
    expect(old.discardedAt).toBeInstanceOf(Date);
    expect(iso(old.periodEnd)).toBe('2026-08-11');
  });

  it('closes off an assignment that has been running', async () => {
    const { service, rows } = setup([
      {
        id: 'old',
        periodStart: utc('2026-07-20'),
        periodEnd: utc('2026-08-02'),
      },
    ]);

    await service.rotateNow('hk-1', { now: TODAY, notify: false });

    // Diese Tage haben stattgefunden, also bleiben sie im Archiv und enden
    // gestern, statt gelöscht zu werden.
    const old = rows.find((row) => row.id === 'old') as Row;
    expect(iso(old.periodEnd)).toBe('2026-07-28');
    expect(old.discardedAt).toBeNull();
  });

  it('builds a round when there is none planned to pull forward', async () => {
    const { service, upcoming } = setup();

    const result = await service.rotateNow('hk-1', {
      now: TODAY,
      notify: false,
    });

    expect(result.created).toBe(true);
    expect(upcoming()[0]).toBe('2026-07-29…2026-08-11');
    // Auch hier steht danach der volle Vorlauf.
    expect(upcoming()).toHaveLength(ROUNDS_AHEAD);
  });

  it('can rotate quietly', async () => {
    const { service, notify } = setup();

    const result = await service.rotateNow('hk-1', {
      now: TODAY,
      notify: false,
    });

    expect(notify).not.toHaveBeenCalled();
    expect(result.notified).toBe(0);
  });

  it('announces the new round by default', async () => {
    const { service, notify } = setup();

    const result = await service.rotateNow('hk-1', { now: TODAY });

    expect(result.notified).toBe(2);
    expect(notify).toHaveBeenCalledTimes(2);
  });
});

/**
 * Die Reihenfolge aus `buildGroups` **ist** der Kreis — wer auf `position`
 * steht, betet für den auf `(position + 1) % n`. Sie muss also mitgeschrieben
 * werden, sonst entscheidet später die Datenbank darüber, wer für wen betet.
 */
describe('PrayerBuddyGeneratorService.assign — der Kreis', () => {
  it('schreibt die Positionen in der Reihenfolge der Gruppe', async () => {
    const { service, prayerBuddyGroup } = setup();

    await service.rotateNow('hk-1', { now: TODAY, notify: false });

    const zeilen = (prayerBuddyGroup.create.mock.calls as any[][]).flatMap(
      (call) => call[0].data.members.create as { position: number }[],
    );

    expect(zeilen.length).toBeGreaterThan(0);

    for (const call of prayerBuddyGroup.create.mock.calls as any[][]) {
      const plaetze = (
        call[0].data.members.create as { position: number }[]
      ).map((zeile) => zeile.position);

      expect(plaetze).toEqual(plaetze.map((_platz, index) => index));
    }
  });
});
