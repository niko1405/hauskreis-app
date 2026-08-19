/**
 * Die einzelne Einheit — ein Abend ohne Bogen darüber.
 *
 * Was hier festgehalten wird, ist die Regel um die Hülle herum. Sie ist ein
 * `Topic` in der Datenbank und keines in der App, und dazwischen stehen genau
 * drei Sätze:
 *
 * 1. **Sie trägt genau eine Einheit.** Eine zweite anzulegen wird abgewiesen —
 *    zwei Abende, über denen nichts steht, sind kein Thema, sondern zwei
 *    Abende.
 * 2. **Ein Überthema macht aus ihr ein Thema**, ohne dass irgendetwas umzieht:
 *    Titel setzen, Schalter umlegen, fertig.
 * 3. **Mit ihrer Einheit verschwindet sie.** Sonst bliebe ein titelloses Thema
 *    stehen, das niemand angelegt hat und niemand sieht — bis es in einer Liste
 *    auftaucht.
 */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { TopicSessionService } from './topic-session.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TopicLinkService } from './topic-link.service';
import type { RoleAssignmentNotifier } from '../notification/role-assignment-notifier.service';
import type { AvailabilityService } from '../role-suggestion/availability.service';
import { withClock } from '../meeting/group-clock.testing';

const BERLIN = 'Europe/Berlin';
const KOMMENDER_DIENSTAG = new Date('2026-08-11T00:00:00.000Z');
const LETZTER_DIENSTAG = new Date('2026-07-28T00:00:00.000Z');

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-08-05T12:00:00.000Z'));
});

afterAll(() => {
  jest.useRealTimers();
});

const ICH = { personId: 'p1', isAdmin: false, zone: BERLIN };

function setup(
  options: {
    /** Die Einheit, auf die `nameTopic`, `promote` und `removeSession` treffen. */
    vorlage?: Record<string, unknown> | null;
    /** Trifft das `updateMany` auf der Hülle noch `standalone: true`? */
    benannt?: number;
  } = {},
) {
  const topicCreate = jest.fn().mockResolvedValue({ id: 't-huelle' });
  const sessionCreate = jest.fn().mockResolvedValue({ id: 's-neu' });
  const topicUpdateMany = jest
    .fn()
    .mockResolvedValue({ count: options.benannt ?? 1 });
  const topicDelete = jest.fn().mockResolvedValue({});
  const sessionDelete = jest.fn().mockResolvedValue({});

  const vorlage =
    options.vorlage === undefined
      ? {
          id: 's-alt',
          topicId: 't-huelle',
          meetingId: 'm-alt',
          meeting: { date: LETZTER_DIENSTAG, status: 'PLANNED' },
          topic: {
            id: 't-huelle',
            title: null,
            status: 'RUNNING',
            standalone: true,
            ownerPersonId: 'p1',
            collaborators: [],
            sessions: [{ id: 's-alt', meeting: null }],
          },
          responsibles: [{ personId: 'p1' }],
        }
      : options.vorlage;

  const tx = {
    topic: {
      create: topicCreate,
      updateMany: topicUpdateMany,
      delete: topicDelete,
      findFirst: jest.fn().mockResolvedValue(vorlage?.topic ?? null),
    },
    topicSession: {
      create: sessionCreate,
      delete: sessionDelete,
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(vorlage),
    },
    meeting: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };

  const prisma = {
    ...tx,
    meeting: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'm1',
        date: KOMMENDER_DIENSTAG,
        hasTopicSlot: true,
        topicResponsibles: [{ personId: 'p1' }],
        topicSession: null,
      }),
    },
    // Dieselbe Zeile bedient beide Leser: `nameTopic` und `removeSession`
    // holen darüber ihre Vorlage, `findSession` am Ende jedes Weges die
    // Antwort. Deshalb trägt jede Vorlage auch `topic.sessions` — daraus zählt
    // `findSession` „Einheit 1 von 1".
    topicSession: {
      ...tx.topicSession,
      findFirst: jest.fn().mockResolvedValue(vorlage),
    },
    topic: { ...tx.topic, updateMany: topicUpdateMany },
    $transaction: jest.fn((run: (client: unknown) => unknown) => run(tx)),
  };

  const links = { join: jest.fn(), reconcile: jest.fn() };

  const service = withClock(
    new TopicSessionService(
      prisma as unknown as PrismaService,
      { announce: jest.fn() } as unknown as RoleAssignmentNotifier,
      { assertAvailable: jest.fn() } as unknown as AvailabilityService,
      links as unknown as TopicLinkService,
    ),
  );

  return {
    service,
    prisma,
    links,
    topicCreate,
    sessionCreate,
    topicUpdateMany,
    topicDelete,
    sessionDelete,
  };
}

describe('eine einzelne Einheit anlegen', () => {
  it('legt die Hülle ohne Titel an und macht die Person zum Owner', async () => {
    const { service, topicCreate } = setup();

    await service.createStandaloneSession('hk', { title: 'Der Abend' }, ICH);

    expect(topicCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { hauskreisId: 'hk', standalone: true, ownerPersonId: 'p1' },
      }),
    );
  });

  /** Ohne Abend und ohne Thema — der Ort zum Vorarbeiten. */
  it('hängt sie an keinen Termin', async () => {
    const { service, sessionCreate, links } = setup();

    await service.createStandaloneSession('hk', { title: 'Der Abend' }, ICH);

    expect(sessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          topicId: 't-huelle',
          title: 'Der Abend',
        }),
      }),
    );
    expect(sessionCreate.mock.calls[0][0].data).not.toHaveProperty('meetingId');
    // Sonst griffe die Rettung aus 8.5 für den eigenen Entwurf nicht.
    expect(links.join).toHaveBeenCalledWith(
      expect.anything(),
      's-neu',
      't-huelle',
      ['p1'],
    );
  });
});

describe('das Überthema', () => {
  it('gibt der Hülle einen Titel und macht sie zum Thema', async () => {
    const { service, topicUpdateMany } = setup();

    await service.nameTopic('hk', 's-alt', 'Vergebung', ICH);

    expect(topicUpdateMany).toHaveBeenCalledWith({
      where: { id: 't-huelle', standalone: true },
      data: {
        title: 'Vergebung',
        standalone: false,
        version: { increment: 1 },
      },
    });
  });

  /**
   * `standalone: true` steht in der Bedingung und nicht in einer Prüfung davor:
   * Sind zwei gleichzeitig dran, schreibt der zweite keinen zweiten Titel über
   * ein Thema, das schon einen hat.
   */
  it('meldet einen Konflikt, wenn jemand schneller war', async () => {
    const { service } = setup({ benannt: 0 });

    await expect(
      service.nameTopic('hk', 's-alt', 'Vergebung', ICH),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('weist eine Einheit ab, die schon zu einem Thema gehört', async () => {
    const { service } = setup({
      vorlage: {
        id: 's-alt',
        topicId: 't-echt',
        topic: {
          id: 't-echt',
          title: 'Vergebung',
          status: 'RUNNING',
          standalone: false,
          ownerPersonId: 'p1',
          collaborators: [],
          sessions: [{ id: 's-alt', meeting: null }],
        },
        responsibles: [{ personId: 'p1' }],
      },
    });

    await expect(
      service.nameTopic('hk', 's-alt', 'Hoffnung', ICH),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('an einem Abend', () => {
  it('mode=single legt Hülle und Einheit an und hängt sie an den Abend', async () => {
    const { service, topicCreate, sessionCreate } = setup();

    await service.choose(
      'hk',
      'm1',
      { mode: 'single', title: 'Der Abend' },
      ICH,
    );

    expect(topicCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { hauskreisId: 'hk', standalone: true, ownerPersonId: 'p1' },
      }),
    );
    expect(sessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          topicId: 't-huelle',
          meetingId: 'm1',
          title: 'Der Abend',
        }),
      }),
    );
  });

  /**
   * Der eigentliche Punkt der Hülle: Es zieht nichts um. Die alte Einheit
   * bleibt an ihrem alten Abend, das Thema war schon da, und dazu kommt nur
   * eine zweite Einheit.
   */
  it('mode=promote benennt das Thema und legt die zweite Einheit an', async () => {
    const { service, topicUpdateMany, sessionCreate, topicCreate } = setup();

    await service.choose(
      'hk',
      'm1',
      { mode: 'promote', sessionId: 's-alt', topicTitle: 'Vergebung' },
      ICH,
    );

    expect(topicUpdateMany).toHaveBeenCalledWith({
      where: { id: 't-huelle', standalone: true },
      data: {
        title: 'Vergebung',
        standalone: false,
        version: { increment: 1 },
      },
    });
    expect(sessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ topicId: 't-huelle', meetingId: 'm1' }),
      }),
    );
    // Kein zweites Thema: die Hülle *ist* das Thema geworden.
    expect(topicCreate).not.toHaveBeenCalled();
  });

  it('mode=promote lehnt eine Einheit ab, die schon zu einem Thema gehört', async () => {
    const { service } = setup({
      vorlage: {
        id: 's-alt',
        topicId: 't-echt',
        topic: {
          id: 't-echt',
          title: 'Vergebung',
          status: 'RUNNING',
          standalone: false,
          ownerPersonId: 'p1',
          collaborators: [],
          sessions: [{ id: 's-alt', meeting: null }],
        },
        responsibles: [{ personId: 'p1' }],
      },
    });

    await expect(
      service.choose(
        'hk',
        'm1',
        { mode: 'promote', sessionId: 's-alt', topicTitle: 'Hoffnung' },
        ICH,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('mode=existing lehnt eine Hülle ab', async () => {
    const { service } = setup();

    await expect(
      service.choose(
        'hk',
        'm1',
        { mode: 'existing', topicId: 't-huelle' },
        ICH,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('eine zweite Einheit an der Hülle', () => {
  it('wird abgewiesen — dafür braucht es erst ein Überthema', async () => {
    const { service } = setup();

    await expect(
      service.createSession('hk', 't-huelle', { title: 'Teil 2' }, ICH),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('die Hülle löschen', () => {
  /**
   * Sonst stünde sie titellos unter „Eigene Themen" — ein Thema, das niemand
   * angelegt hat.
   */
  it('nimmt sie mit, wenn ihre Einheit gelöscht wird', async () => {
    const { service, topicDelete, sessionDelete } = setup({
      vorlage: {
        id: 's-alt',
        topicId: 't-huelle',
        meetingId: null,
        meeting: null,
        topic: {
          id: 't-huelle',
          title: null,
          status: 'RUNNING',
          standalone: true,
          ownerPersonId: 'p1',
          collaborators: [],
          sessions: [{ id: 's-alt', meeting: null }],
        },
      },
    });

    await service.removeSession('hk', 's-alt', ICH);

    expect(topicDelete).toHaveBeenCalledWith({ where: { id: 't-huelle' } });
    // Die Einheit fällt per Cascade mit — ein eigener Aufruf wäre eine zweite
    // Zeile, die dasselbe tut.
    expect(sessionDelete).not.toHaveBeenCalled();
  });

  it('lässt ein echtes Thema stehen', async () => {
    const { service, topicDelete, sessionDelete } = setup({
      vorlage: {
        id: 's-alt',
        topicId: 't-echt',
        meetingId: null,
        meeting: null,
        topic: {
          id: 't-echt',
          title: 'Vergebung',
          status: 'RUNNING',
          standalone: false,
          ownerPersonId: 'p1',
          collaborators: [],
          sessions: [{ id: 's-alt', meeting: null }],
        },
      },
    });

    await service.removeSession('hk', 's-alt', ICH);

    expect(topicDelete).not.toHaveBeenCalled();
    expect(sessionDelete).toHaveBeenCalledWith({ where: { id: 's-alt' } });
  });
});
