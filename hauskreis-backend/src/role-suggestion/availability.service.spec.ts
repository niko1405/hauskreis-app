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
