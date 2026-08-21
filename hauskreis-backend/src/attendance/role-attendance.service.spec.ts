/**
 * „Wer eingeteilt ist, ist dabei."
 *
 * Die Regel greift genau einmal — aus dem Schweigen heraus. Sie dreht keine
 * Absage um, sie rührt eine vorhandene Zusage nicht an, und sie schreibt nichts
 * in einen Abend, der vorbei oder abgesagt ist.
 */
import { RoleAttendanceService } from './role-attendance.service';
// Type-only: keeps Jest from loading the real PrismaClient.
import type { PrismaService } from '../prisma/prisma.service';
import { withClock } from '../meeting/group-clock.testing';
import { AttendanceStatus, MeetingStatus } from '../../generated/prisma/enums';

const HEUTE = new Date('2026-08-21T09:00:00.000Z');

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(HEUTE);
});

afterAll(() => {
  jest.useRealTimers();
});

function setup(
  options: {
    date?: string;
    status?: MeetingStatus;
    /** Was an Antworten schon dasteht. */
    antworten?: { personId: string; status: AttendanceStatus }[];
    fehlt?: boolean;
  } = {},
) {
  const updateMany = jest.fn().mockResolvedValue({ count: 0 });
  const createMany = jest.fn().mockResolvedValue({ count: 0 });
  const meetingUpdateMany = jest.fn().mockResolvedValue({ count: 0 });

  const db = {
    meeting: {
      findUnique: jest.fn().mockResolvedValue(
        options.fehlt
          ? null
          : {
              hauskreisId: 'hk-1',
              date: new Date(`${options.date ?? '2026-08-25'}T00:00:00.000Z`),
              status: options.status ?? MeetingStatus.PLANNED,
            },
      ),
      updateMany: meetingUpdateMany,
    },
    meetingAttendance: {
      findMany: jest.fn().mockResolvedValue(options.antworten ?? []),
      updateMany,
      createMany,
    },
    $transaction: (run: (tx: unknown) => unknown) => run(db),
  };

  const service = withClock(
    new RoleAttendanceService(db as unknown as PrismaService),
  );

  return { service, updateMany, createMany, meetingUpdateMany };
}

describe('RoleAttendanceService.confirm', () => {
  it('sagt für die zu, die noch gar nicht geantwortet haben', async () => {
    const { service, createMany, updateMany } = setup();

    await expect(service.confirm('m-1', ['niko', 'mira'])).resolves.toBe(2);

    expect(createMany.mock.calls[0][0].data).toEqual([
      {
        meetingId: 'm-1',
        personId: 'niko',
        status: 'ATTENDING',
        source: 'ROLE',
      },
      {
        meetingId: 'm-1',
        personId: 'mira',
        status: 'ATTENDING',
        source: 'ROLE',
      },
    ]);
    // Die Aktualisierung läuft trotzdem: Zwischen Lesen und Schreiben kann eine
    // Zeile entstanden sein, und `where` fängt sie ab.
    expect(updateMany.mock.calls[0][0].where.status).toBe('UNKNOWN');
  });

  it('macht aus „weiß noch nicht" ein „dabei"', async () => {
    const { service, updateMany, createMany } = setup({
      antworten: [{ personId: 'niko', status: AttendanceStatus.UNKNOWN }],
    });

    await expect(service.confirm('m-1', ['niko'])).resolves.toBe(1);

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        meetingId: 'm-1',
        personId: { in: ['niko'] },
        status: 'UNKNOWN',
      },
      data: { status: 'ATTENDING', source: 'ROLE' },
    });
    // Nichts anzulegen: die Zeile stand schon da.
    expect(createMany).not.toHaveBeenCalled();
  });

  /**
   * Der Fall gibt es wirklich: Beim Thema wird die Crew der Einheit auf die
   * Abend-Rolle übertragen, und wer an dem Abend fehlt, wird dabei übersprungen
   * statt abgelehnt — mitvorbereiten kann man auch, wenn man selbst nicht kommt.
   * Eine Absage in eine Zusage zu drehen wäre eine Antwort, die niemand gegeben
   * hat.
   */
  it('lässt eine Absage stehen', async () => {
    const { service, updateMany, createMany, meetingUpdateMany } = setup({
      antworten: [{ personId: 'niko', status: AttendanceStatus.ABSENT }],
    });

    await expect(service.confirm('m-1', ['niko'])).resolves.toBe(0);

    expect(updateMany).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
    expect(meetingUpdateMany).not.toHaveBeenCalled();
  });

  it('lässt eine vorhandene Zusage in Ruhe', async () => {
    const { service, updateMany } = setup({
      antworten: [{ personId: 'niko', status: AttendanceStatus.ATTENDING }],
    });

    await expect(service.confirm('m-1', ['niko'])).resolves.toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });

  /** Die Zusage steht mit in der Antwort des Termins. */
  it('hebt die Version des Abends', async () => {
    const { service, meetingUpdateMany } = setup();

    await service.confirm('m-1', ['niko']);

    expect(meetingUpdateMany).toHaveBeenCalledWith({
      where: { id: 'm-1' },
      data: { version: { increment: 1 } },
    });
  });

  /** Nachtragen, wer im Mai das Thema hatte, ist Buchführung, keine Zusage. */
  it('rührt einen vergangenen Abend nicht an', async () => {
    const { service, updateMany, createMany } = setup({ date: '2026-08-04' });

    await expect(service.confirm('m-1', ['niko'])).resolves.toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });

  it('rührt einen abgesagten Abend nicht an', async () => {
    const { service, createMany } = setup({
      status: MeetingStatus.CANCELLED,
    });

    await expect(service.confirm('m-1', ['niko'])).resolves.toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('fragt gar nicht erst nach, wenn niemand dazukommt', async () => {
    const { service, meetingUpdateMany } = setup();

    await expect(service.confirm('m-1', [])).resolves.toBe(0);
    expect(meetingUpdateMany).not.toHaveBeenCalled();
  });
});
