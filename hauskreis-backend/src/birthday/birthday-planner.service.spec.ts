import {
  BirthdayGiftMode,
  NotificationType,
} from '../../generated/prisma/enums';
import { withClock } from '../meeting/group-clock.testing';
import { BirthdayPlannerService, frozen } from './birthday-planner.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationService } from '../notification/notification.service';

const HEUTE = new Date('2026-08-18T09:00:00.000Z');
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

interface Options {
  people?: { id: string; name: string; birthdate: Date | null }[];
  open?: {
    id: string;
    personId: string;
    occursOn: Date;
    responsiblePersonId?: string | null;
    priceCents?: number | null;
    selectedGiftIdeaId?: string | null;
    name?: string;
  }[];
  config?: {
    enabled: boolean;
    mode: BirthdayGiftMode;
    freezeDays: number;
  } | null;
  pairings?: { birthdayPersonId: string; responsiblePersonId: string }[];
}

function setup(options: Options = {}) {
  const open = (options.open ?? []).map((row) => ({
    responsiblePersonId: null,
    priceCents: null,
    selectedGiftIdeaId: null,
    ...row,
    person: { name: row.name ?? row.personId },
  }));

  const occasionCreateMany = jest.fn().mockResolvedValue({ count: 0 });
  const occasionDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
  const occasionUpdate = jest.fn().mockResolvedValue({});
  const pairingDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
  const pairingCreateMany = jest.fn().mockResolvedValue({ count: 0 });
  const configUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
  const logDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
  const notify = jest
    .fn()
    .mockResolvedValue({ delivered: 1, skipped: 0, pruned: 0, failed: 0 });

  const prisma = {
    hauskreis: { findMany: jest.fn().mockResolvedValue([{ id: 'hk-1' }]) },
    person: {
      findMany: jest.fn().mockResolvedValue(options.people ?? []),
    },
    birthdayOccasion: {
      findMany: jest.fn().mockResolvedValue(open),
      createMany: occasionCreateMany,
      deleteMany: occasionDeleteMany,
      update: occasionUpdate,
    },
    birthdayGiftConfig: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          options.config === undefined
            ? { enabled: true, mode: BirthdayGiftMode.ROTATING, freezeDays: 14 }
            : options.config,
        ),
      updateMany: configUpdateMany,
    },
    birthdayGiftPairing: {
      findMany: jest.fn().mockResolvedValue(options.pairings ?? []),
      deleteMany: pairingDeleteMany,
      createMany: pairingCreateMany,
    },
    notificationLog: { deleteMany: logDeleteMany },
    $transaction: jest.fn((run: unknown[]) => Promise.all(run)),
  } as unknown as PrismaService;

  const service = withClock(
    new BirthdayPlannerService(
      prisma,
      { notify } as unknown as NotificationService,
      undefined as never,
    ),
  );

  return {
    service,
    occasionCreateMany,
    occasionDeleteMany,
    occasionUpdate,
    pairingCreateMany,
    configUpdateMany,
    logDeleteMany,
    notify,
  };
}

describe('frozen', () => {
  it('friert ein, sobald die Frist läuft', () => {
    const occasion = { occursOn: day('2026-08-25'), priceCents: null };
    expect(frozen(occasion, day('2026-08-18'), 14)).toBe(true);
    expect(frozen(occasion, day('2026-08-01'), 14)).toBe(false);
  });

  it('friert ein, sobald jemand einen Preis eingetragen hat', () => {
    // Auch weit vorher: Wer das Geschenk schon hat, darf die Zuständigkeit
    // nicht mehr verlieren, weil jemand seinen Geburtstag nachträgt.
    const occasion = { occursOn: day('2026-12-24'), priceCents: 2500 };
    expect(frozen(occasion, day('2026-08-18'), 14)).toBe(true);
  });

  it('zählt Vergangenes als eingefroren', () => {
    expect(
      frozen(
        { occursOn: day('2026-08-01'), priceCents: null },
        day('2026-08-18'),
        14,
      ),
    ).toBe(true);
  });
});

describe('BirthdayPlannerService.plan', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(HEUTE);
  });
  afterEach(() => jest.useRealTimers());

  it('legt für jede Person ihren nächsten Geburtstag an', async () => {
    const { service, occasionCreateMany } = setup({
      people: [
        { id: 'a', name: 'Anna', birthdate: day('1990-08-20') },
        // Schon vorbei — also der nächste im Jahr darauf.
        { id: 'b', name: 'Ben', birthdate: day('1991-03-02') },
      ],
    });

    await service.plan('hk-1');

    expect(occasionCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          { hauskreisId: 'hk-1', personId: 'a', occursOn: day('2026-08-20') },
          { hauskreisId: 'hk-1', personId: 'b', occursOn: day('2027-03-02') },
        ]),
      }),
    );
  });

  it('legt nichts doppelt an', async () => {
    const { service, occasionCreateMany } = setup({
      people: [{ id: 'a', name: 'Anna', birthdate: day('1990-08-20') }],
      open: [{ id: 'o1', personId: 'a', occursOn: day('2026-08-20') }],
    });

    await service.plan('hk-1');

    expect(occasionCreateMany).not.toHaveBeenCalled();
  });

  it('räumt eine Runde weg, deren Datum nicht mehr stimmt', async () => {
    // Jemand hat sein Geburtsdatum korrigiert. Die alte Runde war eine
    // Behauptung, nicht Geschichte.
    const { service, occasionDeleteMany } = setup({
      people: [{ id: 'a', name: 'Anna', birthdate: day('1990-11-04') }],
      open: [{ id: 'alt', personId: 'a', occursOn: day('2026-08-20') }],
    });

    await service.plan('hk-1');

    expect(occasionDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['alt'] } },
    });
  });

  it('lässt eine Runde stehen, an der schon ein Preis hängt', async () => {
    const { service, occasionDeleteMany } = setup({
      people: [{ id: 'a', name: 'Anna', birthdate: day('1990-11-04') }],
      open: [
        {
          id: 'alt',
          personId: 'a',
          occursOn: day('2026-08-20'),
          priceCents: 1500,
        },
      ],
    });

    await service.plan('hk-1');

    expect(occasionDeleteMany).not.toHaveBeenCalled();
  });

  it('trägt die rotierende Zuständigkeit ein und sagt beiden Bescheid', async () => {
    const { service, occasionUpdate, notify } = setup({
      people: [
        { id: 'a', name: 'Anna', birthdate: day('1990-01-10') },
        { id: 'b', name: 'Ben', birthdate: day('1991-04-02') },
      ],
      // Weit genug weg, dass die Frist noch nicht läuft.
      open: [
        { id: 'o-b', personId: 'b', occursOn: day('2027-04-02'), name: 'Ben' },
      ],
    });

    await service.plan('hk-1');

    // Anna kommt im Jahr vor Ben — also besorgt sie sein Geschenk.
    expect(occasionUpdate).toHaveBeenCalledWith({
      where: { id: 'o-b' },
      data: { responsiblePersonId: 'a', version: { increment: 1 } },
    });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        personId: 'a',
        type: NotificationType.BIRTHDAY_GIFT_ASSIGNED,
        relatedOccasionId: 'o-b',
      }),
    );
  });

  it('lässt eine eingefrorene Zuständigkeit in Ruhe', async () => {
    const { service, occasionUpdate, notify } = setup({
      people: [
        { id: 'a', name: 'Anna', birthdate: day('1990-01-10') },
        { id: 'b', name: 'Ben', birthdate: day('1991-08-25') },
      ],
      open: [
        {
          id: 'o-b',
          personId: 'b',
          // In sieben Tagen — die Frist von 14 Tagen läuft längst.
          occursOn: day('2026-08-25'),
          responsiblePersonId: 'wer-auch-immer',
        },
      ],
    });

    await service.plan('hk-1');

    expect(occasionUpdate).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('nimmt allen die Zuständigkeit, wenn das System aus ist', async () => {
    const { service, occasionUpdate } = setup({
      config: {
        enabled: false,
        mode: BirthdayGiftMode.ROTATING,
        freezeDays: 14,
      },
      people: [
        { id: 'a', name: 'Anna', birthdate: day('1990-01-10') },
        { id: 'b', name: 'Ben', birthdate: day('1991-04-02') },
      ],
      open: [
        {
          id: 'o-b',
          personId: 'b',
          occursOn: day('2027-04-02'),
          responsiblePersonId: 'a',
        },
      ],
    });

    await service.plan('hk-1');

    expect(occasionUpdate).toHaveBeenCalledWith({
      where: { id: 'o-b' },
      data: { responsiblePersonId: null, version: { increment: 1 } },
    });
  });

  it('plant ohne Konfigurationszeile gar nicht — und legt auch keine an', async () => {
    const { service, occasionUpdate, configUpdateMany } = setup({
      config: null,
      people: [
        { id: 'a', name: 'Anna', birthdate: day('1990-01-10') },
        { id: 'b', name: 'Ben', birthdate: day('1991-04-02') },
      ],
      open: [{ id: 'o-b', personId: 'b', occursOn: day('2027-04-02') }],
    });

    await service.plan('hk-1');

    // Die Vorgabe ist „aus": niemand wird zuständig, und ein nächtlicher Lauf
    // erzeugt keine Einstellungen, nur weil er nachgesehen hat.
    expect(occasionUpdate).not.toHaveBeenCalled();
    expect(configUpdateMany).not.toHaveBeenCalled();
  });

  it('schließt eine feste Zuteilung und schreibt sie fest', async () => {
    const { service, pairingCreateMany, configUpdateMany } = setup({
      config: { enabled: true, mode: BirthdayGiftMode.MANUAL, freezeDays: 14 },
      people: [
        { id: 'a', name: 'Anna', birthdate: day('1990-01-10') },
        { id: 'b', name: 'Ben', birthdate: day('1991-04-02') },
      ],
      // `c` ist gegangen — für `b` steht damit ein Loch.
      pairings: [{ birthdayPersonId: 'b', responsiblePersonId: 'c' }],
    });

    await service.plan('hk-1');

    expect(pairingCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        {
          hauskreisId: 'hk-1',
          birthdayPersonId: 'b',
          responsiblePersonId: 'a',
        },
      ]),
    });
    // Und der Admin sieht, dass hier etwas ohne ihn entschieden wurde.
    expect(configUpdateMany).toHaveBeenCalledWith({
      where: { hauskreisId: 'hk-1' },
      data: { pairingsRepairedAt: expect.any(Date) },
    });
  });

  it('räumt die alten Nachrichten weg, bevor es neu meldet', async () => {
    // Ohne das verschluckte die Entdopplung jede zweite Nachricht zu derselben
    // Runde — wer zurück in die Zuständigkeit rutscht, erführe es nie.
    const { service, logDeleteMany } = setup({
      people: [
        { id: 'a', name: 'Anna', birthdate: day('1990-01-10') },
        { id: 'b', name: 'Ben', birthdate: day('1991-04-02') },
      ],
      open: [{ id: 'o-b', personId: 'b', occursOn: day('2027-04-02') }],
    });

    await service.plan('hk-1');

    expect(logDeleteMany).toHaveBeenCalledWith({
      where: {
        type: NotificationType.BIRTHDAY_GIFT_ASSIGNED,
        relatedOccasionId: { in: ['o-b'] },
      },
    });
  });
});
