import {
  DEFAULT_INTERVAL_WEEKS,
  DEFAULT_START_MINUTES,
  DEFAULT_WEEKDAY,
  MeetingScheduleConfigService,
} from './meeting-schedule-config.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { IfMatchCondition } from '../common/http/etag';
import { withClock } from './group-clock.testing';

const EGAL: IfMatchCondition = { kind: 'any' };

function setup(existing: Record<string, unknown> | null = null) {
  const findUnique = jest.fn().mockResolvedValue(existing);
  const create = jest.fn((args: { data: Record<string, unknown> }) =>
    Promise.resolve({
      id: 'cfg-1',
      weekday: DEFAULT_WEEKDAY,
      startMinutes: DEFAULT_START_MINUTES,
      version: 0,
      updatedBy: null,
      ...args.data,
    }),
  );
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const touchHauskreis = jest.fn().mockResolvedValue({ count: 1 });
  const meetings = {
    findMany: jest.fn().mockResolvedValue([] as unknown[]),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  };

  const service = withClock(
    new MeetingScheduleConfigService({
      meetingScheduleConfig: { findUnique, create, updateMany },
      hauskreis: { updateMany: touchHauskreis },
      meeting: meetings,
    } as unknown as PrismaService),
  );

  return { service, findUnique, create, updateMany, touchHauskreis, meetings };
}

describe('getConfig', () => {
  it('legt die Zeile beim ersten Lesen an', async () => {
    // Nicht beim Anlegen des Hauskreises: eine Gruppe, die nie etwas
    // einstellt, soll keine Zeile mit sich herumtragen.
    const { service, create } = setup(null);

    const config = await service.getConfig('hk-1');

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { hauskreisId: 'hk-1' } }),
    );
    expect(config.weekday).toBe(DEFAULT_WEEKDAY);
  });

  it('macht aus den Minuten wieder eine Uhrzeit', async () => {
    const { service } = setup({
      id: 'cfg-1',
      hauskreisId: 'hk-1',
      weekday: 4,
      startMinutes: 1170,
      version: 3,
      updatedBy: null,
    });

    await expect(service.getConfig('hk-1')).resolves.toMatchObject({
      startTime: 1170,
    });
  });
});

describe('getRhythm', () => {
  it('gibt den ganzen Rhythmus zurück', async () => {
    const { service } = setup({
      autoGenerate: false,
      weekday: 4,
      intervalWeeks: 2,
      startMinutes: 1170,
      praiseEvenings: false,
    });

    await expect(service.getRhythm('hk-1')).resolves.toEqual({
      autoGenerate: false,
      weekday: 4,
      intervalWeeks: 2,
      startMinutes: 1170,
      praiseEvenings: false,
    });
  });

  it('legt nichts an, wenn noch nichts dasteht', async () => {
    // Der nächtliche Lauf fasst jeden Hauskreis an; Zeilen für Gruppen zu
    // erzeugen, die nie in die Verwaltung geschaut haben, wäre eine Nebenwirkung
    // ohne Anlass. Die Vorgaben müssen deshalb **hier** noch einmal stehen —
    // sonst bekäme so eine Gruppe `undefined` statt des Spalten-Defaults.
    const { service, create } = setup(null);

    await expect(service.getRhythm('hk-1')).resolves.toEqual({
      autoGenerate: true,
      weekday: DEFAULT_WEEKDAY,
      intervalWeeks: DEFAULT_INTERVAL_WEEKS,
      startMinutes: DEFAULT_START_MINUTES,
      praiseEvenings: true,
      snackSlot: false,
      testimony: true,
    });
    expect(create).not.toHaveBeenCalled();
  });
});

describe('updateConfig', () => {
  it('schreibt Wochentag und Uhrzeit und hebt die Version', async () => {
    const { service, updateMany } = setup({
      id: 'cfg-1',
      weekday: 2,
      startMinutes: 1080,
      version: 0,
      updatedBy: null,
    });

    await service.updateConfig(
      'hk-1',
      { weekday: 4, startTime: 1170 },
      'niko',
      EGAL,
    );

    expect(updateMany.mock.calls[0][0].data).toEqual({
      weekday: 4,
      startMinutes: 1170,
      updatedByPersonId: 'niko',
      version: { increment: 1 },
    });
  });

  it('sorgt dafür, dass eine Zeile da ist, bevor es losgeht', async () => {
    // Sonst schriebe `updateMany` auf null Zeilen und meldete „gibt es nicht",
    // obwohl nur noch nie jemand hingesehen hat.
    const { service, create } = setup(null);

    await service.updateConfig(
      'hk-1',
      { weekday: 3, startTime: 1200 },
      'niko',
      EGAL,
    );

    expect(create).toHaveBeenCalled();
  });

  /**
   * Der Schalter steht als `features` in der Antwort des Hauskreises, deren
   * ETag an `hauskreis.version` hängt — ohne den Griff bekäme der Client `304`
   * und behielte den alten Stand.
   */
  it('hebt die Version des Hauskreises, wenn der Actionstep-Schalter kippt', async () => {
    const { service, touchHauskreis } = setup({
      id: 'cfg-1',
      weekday: 2,
      startMinutes: 1080,
      weeklyActionstep: true,
      version: 0,
      updatedBy: null,
    });

    await service.updateConfig(
      'hk-1',
      { weeklyActionstep: false },
      'niko',
      EGAL,
    );

    expect(touchHauskreis).toHaveBeenCalledWith({
      where: { id: 'hk-1' },
      data: { version: { increment: 1 } },
    });
  });

  /**
   * Abschalten räumt auf — an den Abenden, die noch nicht angefangen haben.
   * Dienstag, 11. August 2026, 19 Uhr Ortszeit: Der Abend um 18 Uhr läuft
   * schon und bleibt, wie er ist; der um 20 Uhr und der nächste Dienstag
   * verlieren Baustein und Einteilung.
   */
  it('nimmt beim Abschalten das Testimony von kommenden Abenden', async () => {
    const { service, meetings, touchHauskreis } = setup({
      id: 'cfg-1',
      weekday: 2,
      startMinutes: 1080,
      testimony: true,
      version: 0,
      updatedBy: null,
    });
    const tag = new Date('2026-08-11T00:00:00.000Z');
    meetings.findMany.mockResolvedValue([
      { id: 'laeuft', date: tag, startMinutes: 1080 },
      { id: 'spaeter', date: tag, startMinutes: 1200 },
      {
        id: 'naechste-woche',
        date: new Date('2026-08-18T00:00:00.000Z'),
        startMinutes: 1080,
      },
    ]);

    await service.updateConfig(
      'hk-1',
      { testimony: false },
      'niko',
      EGAL,
      new Date('2026-08-11T17:00:00.000Z'),
    );

    expect(meetings.findMany.mock.calls[0][0].where).toEqual({
      hauskreisId: 'hk-1',
      hasTestimonySlot: true,
      date: { gte: tag },
    });
    expect(meetings.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['spaeter', 'naechste-woche'] } },
      data: {
        hasTestimonySlot: false,
        testimonyPersonId: null,
        version: { increment: 1 },
      },
    });
    // Der Schalter steht als `features` am Hauskreis.
    expect(touchHauskreis).toHaveBeenCalled();
  });

  /** Wieder einschalten gilt für neue Abende — es stellt nichts wieder her. */
  it('räumt beim Einschalten nichts', async () => {
    const { service, meetings, touchHauskreis } = setup({
      id: 'cfg-1',
      weekday: 2,
      startMinutes: 1080,
      testimony: false,
      version: 0,
      updatedBy: null,
    });

    await service.updateConfig('hk-1', { testimony: true }, 'niko', EGAL);

    expect(meetings.findMany).not.toHaveBeenCalled();
    expect(meetings.updateMany).not.toHaveBeenCalled();
    expect(touchHauskreis).toHaveBeenCalled();
  });

  it('lässt den Hauskreis in Ruhe, wenn sich der Schalter nicht ändert', async () => {
    const { service, touchHauskreis } = setup({
      id: 'cfg-1',
      weekday: 2,
      startMinutes: 1080,
      weeklyActionstep: true,
      version: 0,
      updatedBy: null,
    });

    await service.updateConfig('hk-1', { weekday: 4 }, 'niko', EGAL);
    await service.updateConfig(
      'hk-1',
      { weeklyActionstep: true },
      'niko',
      EGAL,
    );

    expect(touchHauskreis).not.toHaveBeenCalled();
  });
});
