/**
 * Der Weg zurück: aus dem Thema wird wieder eine einzelne Einheit.
 *
 * Er fehlte lange mit Absicht, und die Begründung stimmte: „Das Thema doch
 * wieder auflösen" ist nur dann eindeutig, wenn **genau eine** Einheit
 * daranhängt — wer die zweite schon angelegt hat, meint mit dem Knopf etwas
 * anderes als die App. Mit dieser Bedingung gibt es ihn jetzt.
 *
 * Zwei Dinge, die dabei ausdrücklich stehen bleiben: die **Bindung an den
 * Abend** und die Leute am Thema. Angefasst wird nur die eine Zeile.
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
import type { AvailabilityService } from '../role-suggestion/availability.service';
import { withClock } from '../meeting/group-clock.testing';

const HEUTE = new Date('2026-08-05T12:00:00.000Z');
const BERLIN = 'Europe/Berlin';

const OWNER = { personId: 'p1', isAdmin: false, zone: BERLIN };
const MITARBEIT = { personId: 'p2', isAdmin: false, zone: BERLIN };

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(HEUTE);
});

afterAll(() => {
  jest.useRealTimers();
});

function setup(
  options: {
    standalone?: boolean;
    sessionCount?: number;
    /** Was `updateMany` getroffen hat — `0` heißt: jemand war schneller. */
    treffer?: number;
  } = {},
) {
  const topicUpdate = jest
    .fn()
    .mockResolvedValue({ count: options.treffer ?? 1 });
  const sessionTouch = jest.fn().mockResolvedValue({ count: 1 });
  const meetingTouch = jest.fn().mockResolvedValue({ count: 1 });

  const tx = {
    topic: { updateMany: topicUpdate },
    topicSession: { updateMany: sessionTouch },
    meeting: { updateMany: meetingTouch },
  };

  const gemeinsam = {
    id: 't1',
    title: 'Apostelgeschichte',
    status: 'RUNNING',
    standalone: options.standalone ?? false,
    ownerPersonId: 'p1',
    collaborators: [{ personId: 'p2' }],
  };

  const prisma = {
    topicSession: {
      findFirst: jest.fn().mockResolvedValue({
        id: 's1',
        topicId: 't1',
        meetingId: 'm1',
        title: null,
        actionstepText: null,
        summaryText: null,
        createdAt: HEUTE,
        updatedAt: HEUTE,
        version: 0,
        meeting: null,
        responsibles: [],
        topic: {
          ...gemeinsam,
          sessions: Array.from(
            { length: options.sessionCount ?? 1 },
            (_unused, index) => ({ id: `s${index + 1}`, meeting: null }),
          ),
        },
      }),
    },
    $transaction: jest.fn((run: (client: unknown) => unknown) => run(tx)),
  };

  const service = withClock(
    new TopicSessionService(
      prisma as unknown as PrismaService,
      { announce: jest.fn() } as unknown as RoleAssignmentNotifier,
      {} as unknown as AvailabilityService,
      { join: jest.fn() } as unknown as TopicLinkService,
    ),
  );

  return { service, topicUpdate, sessionTouch, meetingTouch };
}

describe('unnameTopic', () => {
  it('macht aus dem Thema wieder eine Hülle', async () => {
    const { service, topicUpdate } = setup();

    await service.unnameTopic('hk', 's1', OWNER);

    expect(topicUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 't1', standalone: false },
        data: expect.objectContaining({
          title: null,
          summaryText: null,
          standalone: true,
        }),
      }),
    );
  });

  /**
   * Der Punkt, um den es dem Wunsch ging: Die Einheit bleibt an ihrem Abend.
   * Angefasst wird nur die Zeile des Themas — `meetingId` taucht in den Daten
   * gar nicht erst auf.
   */
  it('lässt die Bindung an den Abend stehen', async () => {
    const { service, topicUpdate } = setup();

    await service.unnameTopic('hk', 's1', OWNER);

    const { data } = topicUpdate.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(data).not.toHaveProperty('meetingId');
  });

  /**
   * Die Terminkarte zeigt „Zugehöriges Thema" und „Einheit 2 von 3" allein aus
   * `standalone`. Ohne den Sprung bliebe ihr ETag stehen, der Server antwortete
   * `304`, und dort stünde weiter ein Thema, das es nicht mehr gibt.
   */
  it('lässt Einheit und Termin mit altern', async () => {
    const { service, sessionTouch, meetingTouch } = setup();

    await service.unnameTopic('hk', 's1', OWNER);

    expect(sessionTouch).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 's1' } }),
    );
    expect(meetingTouch).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'm1' } }),
    );
  });

  /**
   * Gezählt werden **alle**, Entwürfe eingeschlossen: Ein Entwurf ist Arbeit,
   * die jemand angefangen hat, und sie hinge danach an einer Hülle, die keine
   * zweite Einheit tragen kann.
   */
  it('lehnt ab, sobald eine zweite Einheit daranhängt', async () => {
    const { service } = setup({ sessionCount: 2 });

    await expect(service.unnameTopic('hk', 's1', OWNER)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('lehnt ab, wenn es schon eine Hülle ist', async () => {
    const { service } = setup({ standalone: true });

    await expect(service.unnameTopic('hk', 's1', OWNER)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  /** Titel und Gesamt-Zusammenfassung fallen weg — das ist Löschen. */
  it('lässt nur den Owner ran', async () => {
    const { service } = setup();

    await expect(
      service.unnameTopic('hk', 's1', MITARBEIT),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  /** Zwei gleichzeitige Griffe: der beobachtete Stand steht in der Bedingung. */
  it('meldet einen Konflikt, wenn jemand schneller war', async () => {
    const { service } = setup({ treffer: 0 });

    await expect(service.unnameTopic('hk', 's1', OWNER)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
