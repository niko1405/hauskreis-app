/**
 * „Ich bin grundsätzlich dabei." — und die Grenzen dieses Satzes.
 *
 * Der Schalter füllt Lücken. Er überschreibt keine Antworten, und er sticht
 * keinen Abwesenheitszeitraum; das prüft `absence-sync.service.spec.ts`.
 */
import { AutoAttendanceService } from './auto-attendance.service';
// Type-only: keeps Jest from loading the real PrismaClient.
import type { PrismaService } from '../prisma/prisma.service';
import { withClock } from '../meeting/group-clock.testing';

const TODAY = new Date('2026-08-05T09:00:00.000Z');

function setup(options: { people?: string[]; meetings?: string[] } = {}) {
  const createMany = jest.fn().mockResolvedValue({ count: 3 });
  const personFindMany = jest
    .fn()
    .mockResolvedValue((options.people ?? ['p1']).map((id) => ({ id })));
  const meetingFindMany = jest
    .fn()
    .mockResolvedValue((options.meetings ?? ['m1']).map((id) => ({ id })));

  const service = withClock(
    new AutoAttendanceService({
      person: { findMany: personFindMany },
      meeting: { findMany: meetingFindMany },
      meetingAttendance: { createMany },
    } as unknown as PrismaService),
  );

  return { service, createMany, personFindMany, meetingFindMany };
}

describe('AutoAttendanceService.apply', () => {
  it('sagt jeden kommenden Abend für jede eingestellte Person zu', async () => {
    const { service, createMany } = setup({
      people: ['p1', 'p2'],
      meetings: ['m1', 'm2'],
    });

    await service.apply('hk-1', { now: TODAY });

    expect(createMany.mock.calls[0][0].data).toHaveLength(4);
    expect(createMany.mock.calls[0][0].data[0]).toEqual({
      meetingId: 'm1',
      personId: 'p1',
      status: 'ATTENDING',
      source: 'AUTO',
    });
  });

  /** Die ganze Regel: der zusammengesetzte Schlüssel schützt jede Antwort. */
  it('überschreibt nie eine vorhandene Antwort', async () => {
    const { service, createMany } = setup();

    await service.apply('hk-1', { now: TODAY });

    expect(createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });

  it('fragt nur nach denen, die den Schalter anhaben', async () => {
    const { service, personFindMany } = setup();

    await service.apply('hk-1', { now: TODAY });

    expect(personFindMany).toHaveBeenCalledWith({
      where: { hauskreisId: 'hk-1', active: true, autoAttend: true },
      select: { id: true },
    });
  });

  /** Wer den Schalter umlegt, meint die Dienstage, die er vor sich sieht. */
  it('wirkt rückwirkend auf alle kommenden Abende einer Person', async () => {
    const { service, personFindMany, meetingFindMany } = setup();

    await service.apply('hk-1', { personId: 'p9', now: TODAY });

    expect(personFindMany.mock.calls[0][0].where.id).toBe('p9');
    expect(meetingFindMany.mock.calls[0][0].where.date).toEqual({
      gte: new Date('2026-08-05T00:00:00.000Z'),
    });
  });

  it('lässt vergangene Abende in Ruhe', async () => {
    const { service, meetingFindMany } = setup();

    await service.apply('hk-1', { now: TODAY });

    // Nachträglich zusagen wäre erfundene Anwesenheit.
    expect(meetingFindMany.mock.calls[0][0].where.date.gte).toEqual(
      new Date('2026-08-05T00:00:00.000Z'),
    );
  });

  it('schreibt nichts, wenn niemand den Schalter anhat', async () => {
    const { service, createMany } = setup({ people: [] });

    await expect(service.apply('hk-1', { now: TODAY })).resolves.toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('schreibt nichts, wenn kein Abend ansteht', async () => {
    const { service, createMany } = setup({ meetings: [] });

    await expect(service.apply('hk-1', { now: TODAY })).resolves.toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });
});
