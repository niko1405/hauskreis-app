/**
 * Wer nicht da ist, bekommt keine Rolle — und wer eine hatte und dann absagt,
 * gibt sie zurück.
 *
 * Beides gehört zusammen: ohne die zweite Hälfte hätte die erste ein Loch, durch
 * das man mühelos hindurchfällt (erst eintragen, dann absagen), und das ist der
 * wahrscheinlichere Weg von beiden.
 */
import { BadRequestException } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { RoleReleaseService } from '../meeting/role-release.service';
import type { PrismaService } from '../prisma/prisma.service';

const HEUTE = new Date('2026-08-04T00:00:00.000Z');
const NAECHSTER_DIENSTAG = new Date('2026-08-11T00:00:00.000Z');
const LETZTER_DIENSTAG = new Date('2026-07-28T00:00:00.000Z');

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(HEUTE);
});

afterAll(() => {
  jest.useRealTimers();
});

function setupAvailability(
  options: {
    date?: Date;
    declinedIds?: string[];
    periods?: { personId: string; startDate: Date; endDate: Date }[];
  } = {},
) {
  const prisma = {
    meeting: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ date: options.date ?? NAECHSTER_DIENSTAG }),
    },
    meetingAttendance: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          (options.declinedIds ?? []).map((personId) => ({ personId })),
        ),
    },
    absencePeriod: {
      findMany: jest.fn().mockResolvedValue(options.periods ?? []),
    },
    person: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'p1', name: 'Niko' },
        { id: 'p2', name: 'Mira' },
      ]),
    },
  };

  return {
    service: new AvailabilityService(prisma as unknown as PrismaService),
    prisma,
  };
}

describe('AvailabilityService.assertAvailable', () => {
  it('lässt durch, wer nicht abgesagt hat', async () => {
    const { service } = setupAvailability();

    await expect(
      service.assertAvailable('hk', 'm1', ['p1']),
    ).resolves.toBeUndefined();
  });

  it('weist ab, wer für diesen Abend abgesagt hat', async () => {
    const { service } = setupAvailability({ declinedIds: ['p1'] });

    await expect(service.assertAvailable('hk', 'm1', ['p1'])).rejects.toThrow(
      /Niko ist an diesem Abend nicht dabei/,
    );
  });

  it('weist auch ab, wer in dem Zeitraum verreist ist', async () => {
    const { service } = setupAvailability({
      periods: [
        {
          personId: 'p2',
          startDate: new Date('2026-08-09T00:00:00.000Z'),
          endDate: new Date('2026-08-16T00:00:00.000Z'),
        },
      ],
    });

    await expect(service.assertAvailable('hk', 'm1', ['p2'])).rejects.toThrow(
      /Mira ist an diesem Abend nicht dabei/,
    );
  });

  it('nennt beide Namen, wenn beide fehlen', async () => {
    const { service } = setupAvailability({ declinedIds: ['p1', 'p2'] });

    await expect(
      service.assertAvailable('hk', 'm1', ['p1', 'p2']),
    ).rejects.toThrow(/Niko, Mira sind/);
  });

  it('wirft `BadRequestException`, nicht irgendetwas', async () => {
    const { service } = setupAvailability({ declinedIds: ['p1'] });

    await expect(
      service.assertAvailable('hk', 'm1', ['p1']),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // Nachtragen ist Buchführung, keine Planung: wer damals absagte, kann trotzdem
  // gehostet haben, weil er doch noch kam.
  it('lässt einen vergangenen Abend in Ruhe nachtragen', async () => {
    const { service } = setupAvailability({
      date: LETZTER_DIENSTAG,
      declinedIds: ['p1'],
    });

    await expect(
      service.assertAvailable('hk', 'm1', ['p1']),
    ).resolves.toBeUndefined();
  });

  it('fragt gar nicht erst, wenn niemand genannt ist', async () => {
    const { service, prisma } = setupAvailability();

    await service.assertAvailable('hk', 'm1', []);

    expect(prisma.meeting.findFirst).not.toHaveBeenCalled();
  });
});

function setupRelease(
  meeting: Record<string, unknown> | null = {
    id: 'm1',
    date: NAECHSTER_DIENSTAG,
    status: 'PLANNED',
    hostPersonId: 'p1',
    locationId: 'l-niko',
    location: { requiresHost: true },
  },
) {
  const prisma = {
    meeting: {
      findUnique: jest.fn().mockResolvedValue(meeting),
      update: jest.fn().mockResolvedValue({}),
    },
    meetingSongLeader: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };

  return {
    service: new RoleReleaseService(prisma as unknown as PrismaService),
    prisma,
  };
}

describe('RoleReleaseService.releaseFor', () => {
  it('räumt Gastgeber und dessen Wohnung weg', async () => {
    const { service, prisma } = setupRelease();

    await expect(service.releaseFor('m1', 'p1')).resolves.toEqual({
      host: true,
      song: false,
    });

    expect(prisma.meeting.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          hostPersonId: null,
          locationId: null,
        }),
      }),
    );
  });

  it('lässt einen Treffpunkt stehen — der hing nie am Gastgeber', async () => {
    const { service, prisma } = setupRelease({
      id: 'm1',
      date: NAECHSTER_DIENSTAG,
      status: 'PLANNED',
      hostPersonId: 'p1',
      locationId: 'l-park',
      location: { requiresHost: false },
    });

    await service.releaseFor('m1', 'p1');

    expect(prisma.meeting.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ locationId: undefined }),
      }),
    );
  });

  it('fasst den Gastgeber nicht an, wenn jemand anders absagt', async () => {
    const { service, prisma } = setupRelease();

    await expect(service.releaseFor('m1', 'p2')).resolves.toEqual({
      host: false,
      song: false,
    });

    expect(prisma.meeting.update).not.toHaveBeenCalled();
  });

  it('meldet die Musik, wenn eine Zeile wegfiel', async () => {
    const { service, prisma } = setupRelease({
      id: 'm1',
      date: NAECHSTER_DIENSTAG,
      status: 'PLANNED',
      hostPersonId: null,
      locationId: null,
      location: null,
    });
    prisma.meetingSongLeader.deleteMany.mockResolvedValue({ count: 1 });

    await expect(service.releaseFor('m1', 'p2')).resolves.toEqual({
      host: false,
      song: true,
    });
  });

  it('lässt einen vergangenen Abend unberührt', async () => {
    const { service, prisma } = setupRelease({
      id: 'm1',
      date: LETZTER_DIENSTAG,
      status: 'PLANNED',
      hostPersonId: 'p1',
      locationId: 'l-niko',
      location: { requiresHost: true },
    });

    await service.releaseFor('m1', 'p1');

    expect(prisma.meeting.update).not.toHaveBeenCalled();
    expect(prisma.meetingSongLeader.deleteMany).not.toHaveBeenCalled();
  });

  // Ein abgesagter Abend hat keine Rollen mehr zu vergeben, und ihn beim
  // Wiederaufleben leer vorzufinden wäre die schlechtere Überraschung.
  it('lässt einen abgesagten Abend unberührt', async () => {
    const { service, prisma } = setupRelease({
      id: 'm1',
      date: NAECHSTER_DIENSTAG,
      status: 'CANCELLED',
      hostPersonId: 'p1',
      locationId: 'l-niko',
      location: { requiresHost: true },
    });

    await service.releaseFor('m1', 'p1');

    expect(prisma.meeting.update).not.toHaveBeenCalled();
  });
});

/**
 * Verlassen ist etwas anderes als absagen — und deshalb greift hier auch mehr
 * zu als bei einer einzelnen Absage.
 */
function setupLeaving(
  meetings: {
    id: string;
    hostPersonId: string | null;
    requiresHost?: boolean;
  }[],
) {
  const meetingUpdate = jest.fn().mockResolvedValue({});
  const deletes: Record<string, unknown> = {};

  const batch = (name: string, count: number) =>
    jest.fn((args: { where: unknown }) => {
      deletes[name] = args.where;
      return Promise.resolve({ count });
    });

  const prisma = {
    meeting: {
      findMany: jest.fn().mockResolvedValue(
        meetings.map((meeting) => ({
          id: meeting.id,
          hostPersonId: meeting.hostPersonId,
          location:
            meeting.requiresHost === undefined
              ? null
              : { requiresHost: meeting.requiresHost },
        })),
      ),
      update: meetingUpdate,
    },
    meetingSongLeader: { deleteMany: batch('song', 1) },
    topicResponsible: { deleteMany: batch('topic', 1) },
    meetingAttendance: { deleteMany: batch('attendance', 2) },
    $transaction: jest.fn((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  };

  return {
    service: new RoleReleaseService(prisma as unknown as PrismaService),
    meetingUpdate,
    deletes,
  };
}

describe('RoleReleaseService.releaseEverythingUpcoming', () => {
  it('nimmt die Person aus jedem kommenden Gastgeber-Platz', async () => {
    const { service, meetingUpdate } = setupLeaving([
      { id: 'm1', hostPersonId: 'p1', requiresHost: true },
      { id: 'm2', hostPersonId: 'p2', requiresHost: true },
      { id: 'm3', hostPersonId: 'p1', requiresHost: true },
    ]);

    const result = await service.releaseEverythingUpcoming('hk', 'p1');

    expect(result.host).toBe(2);
    expect(meetingUpdate).toHaveBeenCalledTimes(2);
    expect(meetingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'm1' },
        data: expect.objectContaining({
          hostPersonId: null,
          locationId: null,
        }),
      }),
    );
  });

  it('lässt einen Treffpunkt stehen — der hing nie am Gastgeber', async () => {
    const { service, meetingUpdate } = setupLeaving([
      { id: 'm1', hostPersonId: 'p1', requiresHost: false },
    ]);

    await service.releaseEverythingUpcoming('hk', 'p1');

    expect(meetingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ locationId: undefined }),
      }),
    );
  });

  /**
   * Der Unterschied zur einzelnen Absage: dort bleibt das Thema stehen, weil
   * die Person am nächsten Abend wieder da ist. Wer geht, ist an keinem Abend
   * mehr da.
   */
  it('nimmt auch laufende Themen mit — abgeschlossene nicht', async () => {
    const { service, deletes } = setupLeaving([
      { id: 'm1', hostPersonId: null },
    ]);

    const result = await service.releaseEverythingUpcoming('hk', 'p1');

    expect(result.topic).toBe(1);
    expect(deletes.topic).toEqual({
      personId: 'p1',
      topic: { hauskreisId: 'hk', status: 'RUNNING' },
    });
  });

  it('räumt die eigenen Antworten weg', async () => {
    const { service, deletes } = setupLeaving([
      { id: 'm1', hostPersonId: null },
      { id: 'm2', hostPersonId: null },
    ]);

    await service.releaseEverythingUpcoming('hk', 'p1');

    // „Kommt nicht" von jemandem, der gar nicht mehr dabei ist, verzerrt jede
    // Zählung.
    expect(deletes.attendance).toEqual({
      personId: 'p1',
      meetingId: { in: ['m1', 'm2'] },
    });
  });

  it('meldet alle kommenden Abende zurück, nicht nur die berührten', async () => {
    const { service } = setupLeaving([
      { id: 'm1', hostPersonId: null },
      { id: 'm2', hostPersonId: null },
    ]);

    // Mit der Person ändert sich die Zahl der aktiven Menschen — und damit die
    // Schwelle, ab der ein Abend „alle haben abgesagt" ist.
    const result = await service.releaseEverythingUpcoming('hk', 'p1');

    expect(result.meetingIds).toEqual(['m1', 'm2']);
  });

  it('fasst gar nichts an, wenn nichts mehr kommt', async () => {
    const { service, deletes } = setupLeaving([]);

    await expect(
      service.releaseEverythingUpcoming('hk', 'p1'),
    ).resolves.toEqual({ meetingIds: [], host: 0, song: 0, topic: 0 });
    expect(deletes).toEqual({});
  });
});
