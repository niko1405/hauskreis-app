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

function setup(
  options: {
    people?: string[];
    meetings?: string[];
    /** Wo schon eine Antwort steht, als `meetingId:personId`. */
    beantwortet?: string[];
  } = {},
) {
  const createMany = jest.fn().mockResolvedValue({ count: 3 });
  const personFindMany = jest
    .fn()
    .mockResolvedValue((options.people ?? ['p1']).map((id) => ({ id })));
  const meetingFindMany = jest
    .fn()
    .mockResolvedValue((options.meetings ?? ['m1']).map((id) => ({ id })));
  const attendanceFindMany = jest.fn().mockResolvedValue(
    (options.beantwortet ?? []).map((key) => {
      const [meetingId, personId] = key.split(':');
      return { meetingId, personId };
    }),
  );
  const meetingUpdateMany = jest.fn().mockResolvedValue({ count: 0 });

  const db = {
    person: { findMany: personFindMany },
    meeting: { findMany: meetingFindMany, updateMany: meetingUpdateMany },
    meetingAttendance: { createMany, findMany: attendanceFindMany },
    $transaction: (fn: (tx: unknown) => unknown) => fn(db),
  };

  const service = withClock(
    new AutoAttendanceService(db as unknown as PrismaService),
  );

  return {
    service,
    createMany,
    personFindMany,
    meetingFindMany,
    meetingUpdateMany,
  };
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

  /**
   * Der Fehler, den man als „die Terminkarte zählt eine Zusage zu viel"
   * bemerkt.
   *
   * Hier stand `active: true` allein. Eine eingeladene Person ist aber von der
   * ersten Sekunde an aktiv — ihre Zeile entsteht beim Einladen —, und
   * `autoAttend` kann aus einer Voreinstellung kommen (der Seed setzt es). Sie
   * sagte damit jeden Dienstag zu, ohne die App je geöffnet zu haben, während
   * die Anwesenheitsliste sie über `ANGEKOMMEN` weglässt. Zwei Zahlen über
   * denselben Abend, und die kleinere war die richtige.
   */
  it('fragt nur nach denen, die den Schalter anhaben — und da sind', async () => {
    const { service, personFindMany } = setup();

    await service.apply('hk-1', { now: TODAY });

    expect(personFindMany).toHaveBeenCalledWith({
      where: {
        hauskreisId: 'hk-1',
        active: true,
        acceptedAt: { not: null },
        autoAttend: true,
      },
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

  /**
   * Der Fehler, den man als „mal ist die Person dabei, mal nicht" bemerkt.
   *
   * Die Zusage steht mit in der Antwort des Termins, dessen ETag allein an
   * `meeting.version` hängt. Ohne diesen Griff blieb er stehen: Die
   * Terminliste zeigte die frische Zusage (dort ist der ETag ein
   * Inhalts-Hash), die Detailseite antwortete `304` und ließ die Person unter
   * „weiß noch nicht" stehen.
   */
  it('hebt die Version der Abende, in die es geschrieben hat', async () => {
    const { service, meetingUpdateMany } = setup({
      people: ['p1'],
      meetings: ['m1', 'm2'],
    });

    await service.apply('hk-1', { now: TODAY });

    expect(meetingUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['m1', 'm2'] } },
      data: { version: { increment: 1 } },
    });
  });

  /** Und nur die: ein Abend, an dem sich nichts ändert, springt nicht. */
  it('lässt einen Abend in Ruhe, an dem schon geantwortet wurde', async () => {
    const { service, createMany, meetingUpdateMany } = setup({
      people: ['p1'],
      meetings: ['m1', 'm2'],
      beantwortet: ['m1:p1'],
    });

    await service.apply('hk-1', { now: TODAY });

    expect(createMany.mock.calls[0][0].data).toEqual([
      {
        meetingId: 'm2',
        personId: 'p1',
        status: 'ATTENDING',
        source: 'AUTO',
      },
    ]);
    expect(meetingUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['m2'] } },
      data: { version: { increment: 1 } },
    });
  });

  it('schreibt nichts, wenn alle Lücken schon gefüllt sind', async () => {
    const { service, createMany, meetingUpdateMany } = setup({
      beantwortet: ['m1:p1'],
    });

    await expect(service.apply('hk-1', { now: TODAY })).resolves.toBe(0);
    expect(createMany).not.toHaveBeenCalled();
    expect(meetingUpdateMany).not.toHaveBeenCalled();
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
