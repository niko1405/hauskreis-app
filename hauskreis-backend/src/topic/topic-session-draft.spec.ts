/**
 * Einheiten ohne Abend — anlegen und löschen.
 *
 * Der Ort, an dem man in Ruhe vorarbeitet. Vorher gab es ihn nicht: eine Einheit
 * entstand nur, wenn jemand an einem Termin wählte, und ein Entwurf konnte
 * ausschließlich rückwirkend entstehen, indem eine Zuteilung wechselte.
 *
 * Zwei Regeln stehen hier auf dem Prüfstand. Wer eine Einheit anlegt, wird ihre
 * Verantwortliche — sonst griffe die Rettung aus Spec 8.5 für handgemachte
 * Entwürfe nicht. Und gelöscht wird nur, was noch nicht war.
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TopicSessionService } from './topic-session.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TopicLinkService } from './topic-link.service';
import type { RoleAssignmentNotifier } from '../notification/role-assignment-notifier.service';
import type { AvailabilityService } from '../role-suggestion/availability.service';

const KOMMENDER_DIENSTAG = new Date('2026-08-11T00:00:00.000Z');
const LETZTER_DIENSTAG = new Date('2026-07-28T00:00:00.000Z');

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-08-05T12:00:00.000Z'));
});

afterAll(() => {
  jest.useRealTimers();
});

function setup(
  options: {
    ownerPersonId?: string | null;
    collaboratorIds?: string[];
    /** Der Abend, an dem die zu löschende Einheit hängt. */
    meeting?: { date: Date; status: string } | null;
  } = {},
) {
  const sessionCreate = jest.fn().mockResolvedValue({ id: 's-neu' });
  const sessionDelete = jest.fn().mockResolvedValue({});
  const topicTouch = jest.fn().mockResolvedValue({ count: 1 });
  const meetingTouch = jest.fn().mockResolvedValue({ count: 1 });

  const topic = {
    id: 't1',
    title: 'Vergebung',
    status: 'COMPLETED',
    ownerPersonId:
      options.ownerPersonId === undefined ? 'p1' : options.ownerPersonId,
    collaborators: (options.collaboratorIds ?? []).map((personId) => ({
      personId,
    })),
  };

  const tx = {
    topicSession: { create: sessionCreate, delete: sessionDelete },
    topic: { updateMany: topicTouch },
    meeting: { updateMany: meetingTouch },
  };

  const prisma = {
    topic: { findFirst: jest.fn().mockResolvedValue(topic) },
    topicSession: {
      findFirst: jest.fn().mockResolvedValue({
        id: 's1',
        topicId: 't1',
        meetingId: options.meeting ? 'm1' : null,
        meeting: options.meeting ?? null,
        topic: { ...topic, sessions: [] },
        title: 'Teil 2',
        actionstepText: null,
        summaryText: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 0,
        responsibles: [],
      }),
    },
    $transaction: jest.fn((run: (tx: unknown) => unknown) => run(tx)),
  };

  const links = { join: jest.fn(), reconcile: jest.fn() };

  const service = new TopicSessionService(
    prisma as unknown as PrismaService,
    { announce: jest.fn() } as unknown as RoleAssignmentNotifier,
    { assertAvailable: jest.fn() } as unknown as AvailabilityService,
    links as unknown as TopicLinkService,
  );

  return {
    service,
    links,
    sessionCreate,
    sessionDelete,
    topicTouch,
    meetingTouch,
  };
}

const ICH = { personId: 'p1', isAdmin: false };
const FREMD = { personId: 'p9', isAdmin: false };

describe('createSession', () => {
  it('legt eine Einheit ohne Abend an', async () => {
    const { service, sessionCreate } = setup();

    await service.createSession(
      'hk',
      't1',
      { title: 'Teil 2', summaryText: 'Worum es geht' },
      ICH,
    );

    expect(sessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          topicId: 't1',
          title: 'Teil 2',
          actionstepText: null,
          summaryText: 'Worum es geht',
        },
      }),
    );
  });

  /**
   * Ohne diese Zeile wäre der eigene Entwurf nach einem Rauswurf aus der
   * Mitarbeit für niemanden mehr sichtbar — auch nicht für die Person, die ihn
   * geschrieben hat. `choices` findet ihn genau darüber wieder.
   */
  it('macht die anlegende Person zur Verantwortlichen', async () => {
    const { service, links } = setup();

    await service.createSession('hk', 't1', { title: 'Teil 2' }, ICH);

    expect(links.join).toHaveBeenCalledWith(expect.anything(), 's-neu', 't1', [
      'p1',
    ]);
  });

  /** Wer ein abgeschlossenes Thema fortsetzt, sagt damit: es war doch nicht fertig. */
  it('nimmt ein abgeschlossenes Thema wieder auf', async () => {
    const { service, topicTouch } = setup();

    await service.createSession('hk', 't1', { title: 'Teil 2' }, ICH);

    expect(topicTouch).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 't1' },
        data: expect.objectContaining({ status: 'RUNNING' }),
      }),
    );
  });

  it('weist ab, wer am Thema nicht mitarbeitet', async () => {
    const { service } = setup();

    await expect(
      service.createSession('hk', 't1', { title: 'Teil 2' }, FREMD),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('removeSession', () => {
  it('löscht einen Entwurf', async () => {
    const { service, sessionDelete } = setup({ meeting: null });

    await service.removeSession('hk', 's1', ICH);

    expect(sessionDelete).toHaveBeenCalledWith({ where: { id: 's1' } });
  });

  it('löscht auch eine Einheit an einem kommenden Abend', async () => {
    const { service, sessionDelete, meetingTouch } = setup({
      meeting: { date: KOMMENDER_DIENSTAG, status: 'PLANNED' },
    });

    await service.removeSession('hk', 's1', ICH);

    expect(sessionDelete).toHaveBeenCalled();
    // Der Abend steht danach wieder ohne Thema da — seine Antwort ändert sich.
    expect(meetingTouch).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'm1' } }),
    );
  });

  /** Ein Abend, der war, ist das Protokoll dessen, was war. */
  it('weist einen gehaltenen Abend ab', async () => {
    const { service } = setup({
      meeting: { date: LETZTER_DIENSTAG, status: 'PLANNED' },
    });

    await expect(service.removeSession('hk', 's1', ICH)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  /**
   * Ein abgesagter Abend hat nicht stattgefunden, auch wenn sein Datum vorbei
   * ist — dieselbe Unterscheidung, die `isHeld` überall trifft.
   */
  it('lässt einen abgesagten Abend zu', async () => {
    const { service, sessionDelete } = setup({
      meeting: { date: LETZTER_DIENSTAG, status: 'CANCELLED' },
    });

    await service.removeSession('hk', 's1', ICH);

    expect(sessionDelete).toHaveBeenCalled();
  });

  it('weist ab, wer am Thema nicht mitarbeitet', async () => {
    const { service } = setup({ meeting: null });

    await expect(
      service.removeSession('hk', 's1', FREMD),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
