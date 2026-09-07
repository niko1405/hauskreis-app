import {
  MEETINGS_AHEAD,
  MeetingGeneratorService,
} from './meeting-generator.service';
// Type-only: keeps Jest from loading the real PrismaClient, which otherwise
// leaves handles open and drags the suite out.
import type { PrismaService } from '../prisma/prisma.service';
import type { AutoAttendanceService } from '../attendance/auto-attendance.service';
import type { MeetingScheduleConfigService } from './meeting-schedule-config.service';
import { withClock } from './group-clock.testing';

type CreateManyArgs = {
  data: {
    hauskreisId: string;
    date: Date;
    generated: boolean;
    startMinutes: number;
    hasTopicSlot: boolean;
    hasTestimonySlot: boolean;
    hasSnackSlot: boolean;
  }[];
  skipDuplicates?: boolean;
};

/** Dienstag, 18 Uhr, jede Woche — die Vorgabe, mit der die Gruppe bisher lebt. */
const TUESDAY_AT_SIX = {
  autoGenerate: true,
  weekday: 2,
  intervalWeeks: 1,
  startMinutes: 18 * 60,
  praiseEvenings: true,
  snackSlot: false,
};

function setup(
  existingDates: Date[] = [],
  rhythm: Partial<typeof TUESDAY_AT_SIX> = {},
  /** Der späteste selbst erzeugte Abend — der Taktschlag. */
  anchor: Date | null = null,
) {
  const createMany = jest.fn(
    (args: CreateManyArgs): Promise<{ count: number }> =>
      Promise.resolve({ count: args.data.length }),
  );
  const meeting = {
    findMany: jest
      .fn()
      .mockResolvedValue(existingDates.map((date) => ({ date }))),
    // Der Anker. `null` heißt „noch nie etwas erzeugt" — dann fängt die Reihe
    // beim nächsten passenden Wochentag an, wie vor dem einstellbaren Abstand.
    findFirst: jest.fn().mockResolvedValue(anchor ? { date: anchor } : null),
    createMany,
  };
  const hauskreis = {
    findMany: jest.fn().mockResolvedValue([{ id: 'hk-1' }]),
  };
  const autoAttendance = { apply: jest.fn().mockResolvedValue(0) };

  const schedule = {
    getRhythm: jest.fn().mockResolvedValue({ ...TUESDAY_AT_SIX, ...rhythm }),
  };

  const service = withClock(
    new MeetingGeneratorService(
      { meeting, hauskreis } as unknown as PrismaService,
      // Füllt sonst die Zusagen derer nach, die grundsätzlich dabei sind. Was
      // dabei herauskommt, prüft `auto-attendance.service.spec.ts`.
      autoAttendance as unknown as AutoAttendanceService,
      schedule as unknown as MeetingScheduleConfigService,
    ),
  );

  return { service, meeting, hauskreis, createMany, schedule };
}

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const isoOf = (date: Date) => date.toISOString().slice(0, 10);

// A Monday, so the first generated meeting is the very next day.
const MONDAY = utc('2026-07-27');

describe('MeetingGeneratorService.generateFor', () => {
  it('fills the planning window with consecutive Tuesdays', async () => {
    const { service, createMany } = setup();

    const result = await service.generateFor('hk-1', MONDAY);

    expect(result).toEqual({ created: MEETINGS_AHEAD, skipped: 0 });

    const created = createMany.mock.calls[0][0].data;
    expect(created).toHaveLength(MEETINGS_AHEAD);
    expect(created.map((m) => isoOf(m.date))).toEqual([
      '2026-07-28',
      '2026-08-04',
      '2026-08-11',
      '2026-08-18',
      '2026-08-25',
      '2026-09-01',
      '2026-09-08',
    ]);
  });

  /**
   * Woraus ein Abend besteht, sagen seit dem Wegfall der Terminart nur noch
   * die Bausteine — der letzte im Monat bekommt Testimony statt Thema.
   */
  it('gibt dem letzten Dienstag im Monat ein Testimony statt eines Themas', async () => {
    const { service, createMany } = setup();

    await service.generateFor('hk-1', MONDAY);

    const byDate = new Map(
      createMany.mock.calls[0][0].data.map((m) => [
        isoOf(m.date),
        [m.hasTopicSlot, m.hasTestimonySlot],
      ]),
    );

    expect(byDate.get('2026-07-28')).toEqual([false, true]);
    expect(byDate.get('2026-08-25')).toEqual([false, true]);
    expect(byDate.get('2026-08-04')).toEqual([true, false]);
    expect(byDate.get('2026-09-08')).toEqual([true, false]);
  });

  it('schreibt an jeden erzeugten Abend, dass er erzeugt ist', async () => {
    // Daran hängen der Taktschlag, die Benachrichtigung über neue Termine, die
    // Actionstep-Ausnahme und „löschen statt absagen".
    const { service, createMany } = setup();

    await service.generateFor('hk-1', MONDAY);

    expect(
      createMany.mock.calls[0][0].data.every((m) => m.generated === true),
    ).toBe(true);
  });

  it('is a no-op when every date is already covered', async () => {
    const allDates = [
      '2026-07-28',
      '2026-08-04',
      '2026-08-11',
      '2026-08-18',
      '2026-08-25',
      '2026-09-01',
      '2026-09-08',
    ].map(utc);
    const { service, createMany } = setup(allDates);

    const result = await service.generateFor('hk-1', MONDAY);

    expect(result).toEqual({ created: 0, skipped: MEETINGS_AHEAD });
    expect(createMany).not.toHaveBeenCalled();
  });

  it('leaves an existing meeting alone and only fills the gaps', async () => {
    // The group put a birthday on 2026-08-04; it must survive untouched.
    const { service, createMany } = setup([utc('2026-08-04')]);

    const result = await service.generateFor('hk-1', MONDAY);

    expect(result.created).toBe(MEETINGS_AHEAD - 1);
    const dates = createMany.mock.calls[0][0].data.map((m) => isoOf(m.date));
    expect(dates).not.toContain('2026-08-04');
    expect(dates).toHaveLength(MEETINGS_AHEAD - 1);
  });

  it('gibt jedem Abend die Uhrzeit der Gruppe mit', async () => {
    // Ausdrücklich gesetzt und nicht dem Spalten-Default überlassen: der
    // stimmt nur für eine Gruppe, die sich um 18 Uhr trifft.
    const { service, createMany } = setup([], {
      weekday: 2,
      startMinutes: 1170,
    });

    await service.generateFor('hk-1', MONDAY);

    for (const created of createMany.mock.calls[0][0].data) {
      expect(created.startMinutes).toBe(1170);
    }
  });

  it('legt nichts an, wenn die Gruppe ihren Kalender selbst pflegt', async () => {
    // Auch nicht über den Knopf in der Verwaltung, der genau hier landet.
    const { service, createMany, meeting } = setup([], {
      autoGenerate: false,
    });

    const result = await service.generateFor('hk-1', MONDAY);

    expect(result).toEqual({ created: 0, skipped: 0 });
    expect(createMany).not.toHaveBeenCalled();
    // Und schaut auch nicht nach, was schon dasteht.
    expect(meeting.findMany).not.toHaveBeenCalled();
  });

  it('macht ohne Lobpreisabende auch aus dem letzten im Monat einen Standard', async () => {
    const { service, createMany } = setup([], { praiseEvenings: false });

    await service.generateFor('hk-1', MONDAY);

    const themen = createMany.mock.calls[0][0].data.map((m) => m.hasTopicSlot);
    expect(themen).toEqual(Array<boolean>(MEETINGS_AHEAD).fill(true));
  });

  /**
   * Voreingestellt aus, und das ist die Aussage: Die Rolle ist eine Einladung.
   * Eine Gruppe, die nie über Essen gesprochen hat, bekäme sonst an jedem
   * Dienstag eine offene Zuständigkeit, nach der niemand gefragt hat.
   */
  it('gibt Snacks nicht von selbst vor', async () => {
    const { service, createMany } = setup();

    await service.generateFor('hk-1', MONDAY);

    expect(createMany.mock.calls[0][0].data.map((m) => m.hasSnackSlot)).toEqual(
      Array<boolean>(MEETINGS_AHEAD).fill(false),
    );
  });

  /** Und hängt nicht daran, ob der Abend ein Thema hat — gegessen wird an beiden. */
  it('gibt Snacks überall vor, wenn die Gruppe es einstellt', async () => {
    const { service, createMany } = setup([], { snackSlot: true });

    await service.generateFor('hk-1', MONDAY);

    expect(createMany.mock.calls[0][0].data.map((m) => m.hasSnackSlot)).toEqual(
      Array<boolean>(MEETINGS_AHEAD).fill(true),
    );
  });

  it('hält bei zwei Wochen den Abstand ein', async () => {
    const { service, createMany } = setup([], { intervalWeeks: 2 });

    await service.generateFor('hk-1', MONDAY);

    expect(createMany.mock.calls[0][0].data.map((m) => isoOf(m.date))).toEqual([
      '2026-07-28',
      '2026-08-11',
      '2026-08-25',
      '2026-09-08',
      '2026-09-22',
      '2026-10-06',
      '2026-10-20',
    ]);
  });

  it('setzt die Reihe am letzten erzeugten Abend fort', async () => {
    // Der Taktschlag. Ohne ihn nähme der Lauf am Mittwoch den Dienstag darauf
    // und legte damit eine zweite, um eine Woche versetzte Reihe an.
    const { service, createMany } = setup(
      [],
      { intervalWeeks: 2 },
      utc('2026-07-28'),
    );

    await service.generateFor('hk-1', utc('2026-07-29'));

    expect(
      createMany.mock.calls[0][0].data.map((m) => isoOf(m.date)).slice(0, 3),
    ).toEqual(['2026-08-11', '2026-08-25', '2026-09-08']);
  });

  it('fragt für den Takt nur nach selbst erzeugten Abenden', async () => {
    // Ein Geburtstag am Samstag verschöbe sonst den Takt der Dienstage.
    const { service, meeting } = setup([], { intervalWeeks: 2 });

    await service.generateFor('hk-1', MONDAY);

    expect(meeting.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { hauskreisId: 'hk-1', generated: true },
      }),
    );
  });

  it('folgt dem eingestellten Wochentag', async () => {
    // Donnerstags statt dienstags — der Wochentag stand einmal als Konstante
    // im Terminplaner und war damit eine Aussage über *eine* Gruppe.
    const { service, createMany } = setup([], {
      weekday: 4,
      startMinutes: 1080,
    });

    await service.generateFor('hk-1', MONDAY);

    expect(createMany.mock.calls[0][0].data.map((m) => isoOf(m.date))).toEqual([
      '2026-07-30',
      '2026-08-06',
      '2026-08-13',
      '2026-08-20',
      '2026-08-27',
      '2026-09-03',
      '2026-09-10',
    ]);
  });

  it('guards against a concurrent run', async () => {
    const { service, createMany } = setup();

    await service.generateFor('hk-1', MONDAY);

    expect(createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });
});

describe('MeetingGeneratorService.generateForAllHauskreise', () => {
  it('aggregates the per-group results', async () => {
    const { service, hauskreis } = setup();
    hauskreis.findMany.mockResolvedValue([{ id: 'hk-1' }, { id: 'hk-2' }]);

    const result = await service.generateForAllHauskreise(MONDAY);

    expect(result.created).toBe(MEETINGS_AHEAD * 2);
  });
});

describe('MeetingGeneratorService.closePastMeetings', () => {
  it('marks evenings that have been and gone as completed', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 3 });
    const service = withClock(
      new MeetingGeneratorService(
        {
          meeting: { updateMany },
          // Der Lauf geht Gruppe für Gruppe, seit jede ihre eigene Zeitzone
          // hat — „gestern" fängt anderswo früher an.
          hauskreis: {
            findMany: jest.fn().mockResolvedValue([{ id: 'hk-1' }]),
          },
        } as unknown as PrismaService,
        { apply: jest.fn() } as unknown as AutoAttendanceService,
        {
          getRhythm: jest.fn(),
        } as unknown as MeetingScheduleConfigService,
      ),
    );

    await expect(
      service.closePastMeetings(new Date('2026-07-29T10:00:00.000Z')),
    ).resolves.toBe(3);

    // Cancelled ones keep their status: "fiel aus" is a different fact from
    // "hat stattgefunden", and the archive should tell them apart.
    //
    // `finishedBefore` und nicht `date < heute`: Eine Freizeit von Freitag bis
    // Sonntag wurde sonst am Samstag um drei Uhr geschlossen, während sie lief.
    expect(updateMany.mock.calls[0][0].where).toEqual({
      hauskreisId: 'hk-1',
      OR: [
        { endDate: null, date: { lt: new Date('2026-07-29T00:00:00.000Z') } },
        { endDate: { lt: new Date('2026-07-29T00:00:00.000Z') } },
      ],
      status: 'PLANNED',
    });
    expect(updateMany.mock.calls[0][0].data).toEqual({ status: 'COMPLETED' });
  });
});
