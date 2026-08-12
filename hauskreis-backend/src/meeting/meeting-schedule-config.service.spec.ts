import {
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

  const service = withClock(
    new MeetingScheduleConfigService({
      meetingScheduleConfig: { findUnique, create, updateMany },
    } as unknown as PrismaService),
  );

  return { service, findUnique, create, updateMany };
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
  it('gibt Wochentag und Uhrzeit zurück', async () => {
    const { service } = setup({ weekday: 4, startMinutes: 1170 });

    await expect(service.getRhythm('hk-1')).resolves.toEqual({
      weekday: 4,
      startMinutes: 1170,
    });
  });

  it('legt nichts an, wenn noch nichts dasteht', async () => {
    // Der nächtliche Lauf fasst jeden Hauskreis an; Zeilen für Gruppen zu
    // erzeugen, die nie in die Verwaltung geschaut haben, wäre eine Nebenwirkung
    // ohne Anlass.
    const { service, create } = setup(null);

    await expect(service.getRhythm('hk-1')).resolves.toEqual({
      weekday: DEFAULT_WEEKDAY,
      startMinutes: DEFAULT_START_MINUTES,
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
});
