/**
 * Eine einzelne Einheit in ein Thema holen.
 *
 * Der Weg in die andere Richtung zu `unnameTopic`: Wer einen Abend für sich
 * vorbereitet hat und merkt, dass er zu einem Thema gehört, hängt ihn dort ein.
 * Die Einheit wechselt das Thema, ihre leere Hülle verschwindet. Geholt wird
 * nur Eigenes — und nur, wer am Ziel-Thema mitarbeitet.
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { TopicSessionService } from './topic-session.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TopicLinkService } from './topic-link.service';
import type { RoleAssignmentNotifier } from '../notification/role-assignment-notifier.service';
import type { RoleAttendanceService } from '../attendance/role-attendance.service';
import type { AvailabilityService } from '../role-suggestion/availability.service';
import { withClock } from '../meeting/group-clock.testing';

const HEUTE = new Date('2026-08-05T12:00:00.000Z');
const BERLIN = 'Europe/Berlin';

const ICH = { personId: 'p1', isAdmin: false, zone: BERLIN };
const JEMAND = { personId: 'p9', isAdmin: false, zone: BERLIN };

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(HEUTE);
});

afterAll(() => {
  jest.useRealTimers();
});

function setup(
  options: {
    /** Das Ziel ist selbst eine Hülle. */
    zielHuelle?: boolean;
    /** Wem die Hülle der Einheit gehört. */
    huelleVon?: string;
    /** Die Einheit hängt schon an einem Thema. */
    gebunden?: boolean;
    /** Was `updateMany` getroffen hat — `0` heißt: jemand war schneller. */
    treffer?: number;
    /** Der Abend der Einheit — `null` heißt: noch an keinem. */
    abend?: { date: Date; status: string } | null;
  } = {},
) {
  const sessionMove = jest
    .fn()
    .mockResolvedValue({ count: options.treffer ?? 1 });
  const shellDelete = jest.fn().mockResolvedValue({ count: 1 });
  const topicTouch = jest.fn().mockResolvedValue({ count: 1 });
  const meetingTouch = jest.fn().mockResolvedValue({ count: 1 });

  const tx = {
    topic: { updateMany: topicTouch, deleteMany: shellDelete },
    topicSession: { updateMany: sessionMove },
    meeting: { updateMany: meetingTouch },
  };

  const findMany = jest.fn().mockResolvedValue([
    {
      id: 's1',
      title: 'Vergebung',
      createdAt: HEUTE,
      meeting: null,
    },
  ]);

  const prisma = {
    topic: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ziel',
        title: 'Bergpredigt',
        status: 'COMPLETED',
        standalone: options.zielHuelle ?? false,
        ownerPersonId: 'p1',
        collaborators: [],
      }),
    },
    topicSession: {
      findFirst: jest.fn().mockResolvedValue({
        id: 's1',
        topicId: 'huelle',
        meetingId: options.abend === undefined ? null : 'm1',
        topic: {
          standalone: !(options.gebunden ?? false),
          ownerPersonId: options.huelleVon ?? 'p1',
        },
        meeting: options.abend ?? null,
      }),
      findMany,
    },
    $transaction: jest.fn((run: (client: unknown) => unknown) => run(tx)),
  };

  const service = withClock(
    new TopicSessionService(
      prisma as unknown as PrismaService,
      { announce: jest.fn() } as unknown as RoleAssignmentNotifier,
      { confirm: jest.fn() } as unknown as RoleAttendanceService,
      {} as unknown as AvailabilityService,
      { join: jest.fn() } as unknown as TopicLinkService,
    ),
  );

  return {
    service,
    sessionMove,
    shellDelete,
    topicTouch,
    meetingTouch,
    findMany,
  };
}

describe('adoptSession', () => {
  it('hängt die Einheit ins Thema und räumt die leere Hülle weg', async () => {
    const { service, sessionMove, shellDelete } = setup();

    await service.adoptSession('hk', 'ziel', 's1', ICH);

    expect(sessionMove).toHaveBeenCalledWith({
      where: { id: 's1', topicId: 'huelle' },
      data: { topicId: 'ziel' },
    });
    expect(shellDelete).toHaveBeenCalledWith({
      where: { id: 'huelle', standalone: true },
    });
  });

  it('öffnet ein abgeschlossenes Thema für eine kommende Einheit wieder', async () => {
    const { service, topicTouch } = setup({ abend: null });

    await service.adoptSession('hk', 'ziel', 's1', ICH);

    expect(topicTouch).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ziel' },
        data: expect.objectContaining({ status: 'RUNNING' }),
      }),
    );
  });

  it('lässt es abgeschlossen, wenn der Abend schon war', async () => {
    const { service, topicTouch } = setup({
      abend: { date: new Date('2026-07-21T00:00:00.000Z'), status: 'PLANNED' },
    });

    await service.adoptSession('hk', 'ziel', 's1', ICH);

    const call = topicTouch.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(call.data).not.toHaveProperty('status');
  });

  it('holt keine fremde Einheit', async () => {
    const { service, sessionMove } = setup({ huelleVon: 'p2' });

    await expect(
      service.adoptSession('hk', 'ziel', 's1', ICH),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(sessionMove).not.toHaveBeenCalled();
  });

  it('lässt nur holen, wer am Thema mitarbeitet', async () => {
    const { service } = setup({ huelleVon: 'p9' });

    await expect(
      service.adoptSession('hk', 'ziel', 's1', JEMAND),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('holt nichts in eine Hülle', async () => {
    const { service } = setup({ zielHuelle: true });

    await expect(
      service.adoptSession('hk', 'ziel', 's1', ICH),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('holt keine Einheit, die schon zu einem Thema gehört', async () => {
    const { service } = setup({ gebunden: true });

    await expect(
      service.adoptSession('hk', 'ziel', 's1', ICH),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('meldet einen Konflikt, wenn jemand schneller war', async () => {
    const { service, shellDelete } = setup({ treffer: 0 });

    await expect(
      service.adoptSession('hk', 'ziel', 's1', ICH),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(shellDelete).not.toHaveBeenCalled();
  });
});

describe('adoptableSessions', () => {
  it('fragt nur nach eigenen Hüllen', async () => {
    const { service, findMany } = setup();

    const result = await service.adoptableSessions('hk', 'ziel', ICH);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          topic: { hauskreisId: 'hk', standalone: true, ownerPersonId: 'p1' },
        },
      }),
    );
    expect(result.items).toEqual([
      expect.objectContaining({ id: 's1', title: 'Vergebung', held: false }),
    ]);
  });

  it('verweigert die Liste, wer nicht am Thema mitarbeitet', async () => {
    const { service } = setup();

    await expect(
      service.adoptableSessions('hk', 'ziel', JEMAND),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
