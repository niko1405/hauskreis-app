/**
 * Die Wahl an einem Abend — Spec §3.
 *
 * Zwei Dinge werden hier festgehalten, die man sonst leicht anders baut:
 *
 * 1. **Owner wird, wer zuerst wählt**, nicht wer zuerst zugeteilt wurde. Die
 *    Reihenfolge der Zuteilung spielt gar keine Rolle.
 * 2. Alle, die im Moment der Wahl ebenfalls zugeteilt sind, kommen als
 *    Verantwortliche der Einheit mit — und damit als Mitarbeitende des Themas.
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

/** Die Zone der Gruppe — in den Tests immer dieselbe. */
const BERLIN = 'Europe/Berlin';

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
    assigned?: string[];
    hasTopicSlot?: boolean;
    session?: { id: string; topicId: string } | null;
    date?: Date;
  } = {},
) {
  const topicCreate = jest.fn().mockResolvedValue({ id: 't-neu' });
  const sessionCreate = jest.fn().mockResolvedValue({ id: 's-neu' });
  const sessionUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
  const sessionUpdate = jest.fn().mockResolvedValue({});
  const meetingTouch = jest.fn().mockResolvedValue({ count: 1 });
  const topicTouch = jest.fn().mockResolvedValue({ count: 1 });

  const responsibleDelete = jest.fn().mockResolvedValue({ count: 0 });
  const responsibleCreate = jest.fn().mockResolvedValue({ count: 0 });

  const tx = {
    meeting: { updateMany: meetingTouch },
    meetingTopicResponsible: {
      deleteMany: responsibleDelete,
      createMany: responsibleCreate,
    },
    topic: {
      create: topicCreate,
      updateMany: topicTouch,
      findFirst: jest.fn().mockResolvedValue({
        id: 't-alt',
        title: 'Vergebung',
        status: 'RUNNING',
        ownerPersonId: 'p1',
        standalone: false,
        collaborators: [],
      }),
    },
    topicSession: {
      create: sessionCreate,
      update: sessionUpdate,
      updateMany: sessionUpdateMany,
      findFirst: jest.fn().mockResolvedValue({
        id: 's-entwurf',
        meetingId: null,
        topicId: 't-alt',
        meeting: null,
        topic: {
          id: 't-alt',
          title: null,
          status: 'RUNNING',
          ownerPersonId: 'p1',
          standalone: false,
          collaborators: [],
        },
        responsibles: [{ personId: 'p1' }],
      }),
    },
  };

  const prisma = {
    meeting: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'm1',
        date: options.date ?? KOMMENDER_DIENSTAG,
        hasTopicSlot: options.hasTopicSlot ?? true,
        topicResponsibles: (options.assigned ?? ['p1']).map((personId) => ({
          personId,
        })),
        topicSession:
          options.session === undefined
            ? null
            : options.session && {
                ...options.session,
                topic: {
                  id: options.session.topicId,
                  title: null,
                  status: 'RUNNING',
                  ownerPersonId: 'p1',
                  standalone: false,
                  collaborators: [],
                },
              },
      }),
    },
    topicSession: {
      findFirst: jest.fn().mockResolvedValue({
        id: 's-neu',
        topicId: 't-neu',
        meetingId: 'm1',
        title: null,
        actionstepText: null,
        summaryText: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 0,
        meeting: null,
        responsibles: [],
        topic: {
          id: 't-neu',
          title: null,
          status: 'RUNNING',
          ownerPersonId: 'p1',
          standalone: false,
          collaborators: [],
          // `findSession` zählt daraus „Einheit 1 von 1".
          sessions: [{ id: 's-neu', meeting: null }],
        },
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    // Alle Angefragten gehören zum Hauskreis — die Gegenprobe steht woanders.
    person: {
      count: jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(new Set(where.id.in).size),
      ),
    },
    meetingTopicResponsible: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((run: (tx: unknown) => unknown) => run(tx)),
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
    tx,
    links,
    topicCreate,
    sessionCreate,
    sessionUpdate,
    sessionUpdateMany,
    meetingTouch,
    topicTouch,
  };
}

const ICH = { personId: 'p1', isAdmin: false, zone: BERLIN };
const FREMD = { personId: 'p9', isAdmin: false, zone: BERLIN };

describe('choose — A) neues Thema', () => {
  it('macht die handelnde Person zum Owner', async () => {
    const { service, topicCreate } = setup({ assigned: ['p1', 'p2'] });

    await service.choose('hk', 'm1', { mode: 'new', title: 'Hoffnung' }, ICH);

    expect(topicCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { hauskreisId: 'hk', title: 'Hoffnung', ownerPersonId: 'p1' },
      }),
    );
  });

  /**
   * Spec §3: die Reihenfolge der *Zuteilung* zählt nicht. p2 steht zuerst in der
   * Liste und wird trotzdem nur Mitwirkende — p1 hat gewählt.
   */
  it('nimmt alle zugeteilten Personen als Mitwirkende mit', async () => {
    const { service, links, topicCreate } = setup({ assigned: ['p2', 'p1'] });

    await service.choose('hk', 'm1', { mode: 'new' }, ICH);

    expect(topicCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ownerPersonId: 'p1' }),
      }),
    );
    expect(links.join).toHaveBeenCalledWith(
      expect.anything(),
      's-neu',
      't-neu',
      ['p2', 'p1'],
    );
  });

  /**
   * „Ist niemand zugeteilt, darf jede:r" gilt hier bewusst **nicht** — und
   * inzwischen nirgends mehr, wo etwas *belegt* wird. Wer wählen will, trägt
   * sich vorher als zuständig ein; dieselbe Grenze hält die Liedauswahl
   * (`EditRightsService.assertMayPickSongs`).
   */
  it('lässt bei leerer Zuteilung niemanden wählen', async () => {
    const { service } = setup({ assigned: [] });

    await expect(
      service.choose('hk', 'm1', { mode: 'new' }, FREMD),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  /** Auch kein Admin-Freifahrtschein: die Wahl ist kein Verwaltungsakt. */
  it('lässt auch einen Admin nicht ohne Zuteilung wählen', async () => {
    const { service } = setup({ assigned: ['p1'] });

    await expect(
      service.choose('hk', 'm1', { mode: 'new' }, { ...FREMD, isAdmin: true }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('weist ab, wer nicht zugeteilt ist', async () => {
    const { service } = setup({ assigned: ['p1'] });

    await expect(
      service.choose('hk', 'm1', { mode: 'new' }, FREMD),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('weist einen Abend ohne Thema-Baustein ab', async () => {
    const { service } = setup({ hasTopicSlot: false });

    await expect(
      service.choose('hk', 'm1', { mode: 'new' }, ICH),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  /**
   * Hängt schon etwas am Abend, ist das ein **Wechsel** und kein Fehler: die
   * bisherige Einheit löst sich und wartet als Entwurf. Zwei Schritte („erst
   * zurücknehmen, dann wählen") wären dieselbe Wirkung mit einem Zustand
   * dazwischen, in dem der Abend leer dasteht.
   */
  it('löst die bisherige Einheit, wenn ein anderes Thema gewählt wird', async () => {
    const { service, sessionUpdateMany, topicCreate } = setup({
      session: { id: 's-alt', topicId: 't-alt' },
    });

    await service.choose('hk', 'm1', { mode: 'new', title: 'Hoffnung' }, ICH);

    expect(sessionUpdateMany).toHaveBeenCalledWith({
      // `meetingId` in der Bedingung: hat jemand anderes gerade schon gelöst,
      // trifft das nichts, und der eindeutige Index entscheidet weiter.
      where: { id: 's-alt', meetingId: 'm1' },
      data: { meetingId: null, version: { increment: 1 } },
    });
    expect(topicCreate).toHaveBeenCalled();
  });

  /**
   * Ein Protokoll entsteht nach dem Abend, nicht davor.
   *
   * Man hält den Abend, kommt vor lauter Abend nicht zum Eintragen und holt es
   * hinterher nach — genau dafür ist die Sperre gefallen, die hier früher
   * geprüft wurde.
   */
  it('lässt einen Wechsel an einem vergangenen Abend zu', async () => {
    const { service, sessionUpdateMany, topicCreate } = setup({
      session: { id: 's-alt', topicId: 't-alt' },
      date: LETZTER_DIENSTAG,
    });

    await service.choose('hk', 'm1', { mode: 'new' }, ICH);

    // Die bisherige Einheit löst sich wie immer und wartet als Entwurf.
    expect(sessionUpdateMany).toHaveBeenCalledWith({
      where: { id: 's-alt', meetingId: 'm1' },
      data: { meetingId: null, version: { increment: 1 } },
    });
    expect(topicCreate).toHaveBeenCalled();
  });

  /**
   * Die Zuteilung gilt weiter, und zwar rückwirkend genauso streng.
   *
   * Anders als beim Abhaken der Lieder — dort darf nach dem Abend jede:r, weil
   * „das haben wir gesungen" eine Beobachtung ist. Das Thema ist eine
   * Zuschreibung, und die trifft niemand für einen anderen.
   */
  it('lässt einen Nicht-Zugeteilten auch nachträglich nicht wählen', async () => {
    const { service } = setup({
      session: { id: 's-alt', topicId: 't-alt' },
      date: LETZTER_DIENSTAG,
    });

    await expect(
      service.choose('hk', 'm1', { mode: 'new' }, FREMD),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('choose — B) eigenes Thema fortsetzen', () => {
  it('hängt eine neue Einheit an das gewählte Thema', async () => {
    const { service, sessionCreate } = setup();

    await service.choose(
      'hk',
      'm1',
      { mode: 'existing', topicId: 't-alt' },
      ICH,
    );

    expect(sessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          topicId: 't-alt',
          meetingId: 'm1',
          title: null,
          actionstepText: null,
          summaryText: null,
        },
      }),
    );
  });

  /**
   * Das Anlege-Sheet fragt Titel, Actionstep und Zusammenfassung gleich mit ab.
   * Sie hinterher nachzuschieben ließe den Abend kurz mit einer leeren Einheit
   * dastehen.
   */
  it('übernimmt den mitgegebenen Inhalt sofort', async () => {
    const { service, sessionCreate } = setup();

    await service.choose(
      'hk',
      'm1',
      {
        mode: 'existing',
        topicId: 't-alt',
        title: 'Praktische Umsetzung',
        actionstepText: 'Einmal verzeihen.',
      },
      ICH,
    );

    expect(sessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Praktische Umsetzung',
          actionstepText: 'Einmal verzeihen.',
        }),
      }),
    );
  });

  /** Ein Thema, das einen Abend dazubekommt, läuft wieder. */
  it('nimmt ein abgeschlossenes Thema wieder auf', async () => {
    const { service, topicTouch } = setup();

    await service.choose(
      'hk',
      'm1',
      { mode: 'existing', topicId: 't-alt' },
      ICH,
    );

    expect(topicTouch).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 't-alt' },
        data: expect.objectContaining({ status: 'RUNNING' }),
      }),
    );
  });

  it('weist ab, wer am Thema nicht mitarbeitet', async () => {
    const { service } = setup({ assigned: ['p9'] });

    await expect(
      service.choose('hk', 'm1', { mode: 'existing', topicId: 't-alt' }, FREMD),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('choose — C) Entwurf wieder aufnehmen', () => {
  it('setzt den Termin auf die bestehende Einheit', async () => {
    const { service, sessionUpdateMany } = setup();

    await service.choose(
      'hk',
      'm1',
      { mode: 'resume', sessionId: 's-entwurf' },
      ICH,
    );

    expect(sessionUpdateMany).toHaveBeenCalledWith({
      where: { id: 's-entwurf', meetingId: null },
      data: { meetingId: 'm1', version: { increment: 1 } },
    });
  });

  /**
   * „Offen" heißt nicht nur „an keinem Abend": eine Einheit, die am falschen
   * kommenden Dienstag hängt, zieht um. Geprüft wird auf den **beobachteten**
   * Stand, damit die Datenbank das Rennen weiter entscheidet.
   */
  it('hängt eine Einheit von einem anderen kommenden Abend um', async () => {
    const { service, tx, sessionUpdateMany, meetingTouch } = setup();
    (tx.topicSession.findFirst as jest.Mock).mockResolvedValue({
      id: 's-entwurf',
      meetingId: 'm-anders',
      topicId: 't-alt',
      meeting: { date: KOMMENDER_DIENSTAG },
      topic: {
        id: 't-alt',
        title: null,
        status: 'RUNNING',
        ownerPersonId: 'p1',
        standalone: false,
        collaborators: [],
      },
      responsibles: [{ personId: 'p1' }],
    });

    await service.choose(
      'hk',
      'm1',
      { mode: 'resume', sessionId: 's-entwurf' },
      ICH,
    );

    expect(sessionUpdateMany).toHaveBeenCalledWith({
      where: { id: 's-entwurf', meetingId: 'm-anders' },
      data: { meetingId: 'm1', version: { increment: 1 } },
    });
    // Auch der Quell-Abend hat sich geändert: er steht danach wieder bei
    // „zugeteilt, aber noch nichts gewählt".
    expect(meetingTouch).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'm-anders' } }),
    );
  });

  /** Ein Abend, der war, ist das Protokoll dessen, was war. */
  it('weist das Umhängen von einem vergangenen Abend ab', async () => {
    const { service, tx } = setup();
    (tx.topicSession.findFirst as jest.Mock).mockResolvedValue({
      id: 's-alt',
      meetingId: 'm-alt',
      topicId: 't-alt',
      meeting: { date: LETZTER_DIENSTAG },
      topic: {
        id: 't-alt',
        title: null,
        status: 'RUNNING',
        ownerPersonId: 'p1',
        standalone: false,
        collaborators: [],
      },
      responsibles: [{ personId: 'p1' }],
    });

    await expect(
      service.choose('hk', 'm1', { mode: 'resume', sessionId: 's-alt' }, ICH),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  /**
   * Der Grenzfall aus 8.5: der eigene Entwurf bleibt greifbar, auch wenn der
   * Owner die Person als Mitarbeiterin entfernt hat.
   */
  it('lässt den eigenen Entwurf auch ohne Mitarbeit am Thema zu', async () => {
    const { service, prisma, tx, sessionUpdateMany } = setup({
      assigned: ['p9'],
    });
    (tx.topicSession.findFirst as jest.Mock).mockResolvedValue({
      id: 's-entwurf',
      meetingId: null,
      topicId: 't-alt',
      topic: {
        id: 't-alt',
        title: null,
        status: 'RUNNING',
        ownerPersonId: 'p1',
        standalone: false,
        collaborators: [],
      },
      // p9 ist entfernt worden, steht aber weiter als Verantwortliche drin.
      responsibles: [{ personId: 'p9' }],
    });

    await service.choose(
      'hk',
      'm1',
      { mode: 'resume', sessionId: 's-entwurf' },
      FREMD,
    );

    expect(sessionUpdateMany).toHaveBeenCalled();
    expect(prisma.topicSession.findFirst).toHaveBeenCalled();
  });

  /** Zwei nehmen denselben Entwurf gleichzeitig auf — einer geht leer aus. */
  it('meldet einen Konflikt, wenn jemand schneller war', async () => {
    const { service, sessionUpdateMany } = setup();
    sessionUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.choose(
        'hk',
        'm1',
        { mode: 'resume', sessionId: 's-entwurf' },
        ICH,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('unlink', () => {
  it('löst die Einheit vom kommenden Abend', async () => {
    const { service, sessionUpdate } = setup({
      session: { id: 's1', topicId: 't1' },
    });

    await service.unlink('hk', 'm1', ICH);

    expect(sessionUpdate).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { meetingId: null, version: { increment: 1 } },
    });
  });

  /**
   * Auch nach dem Abend — sonst stünde im selben Sheet ein Weg ins Leere.
   *
   * Wer das Thema dort noch ändern darf, muss es auch wegnehmen können: „wir
   * haben an dem Abend doch etwas anderes gemacht" ist derselbe Satz wie „wir
   * haben gar kein Thema gehabt".
   */
  it('lässt einen vergangenen Abend zu', async () => {
    const { service, sessionUpdate } = setup({
      session: { id: 's1', topicId: 't1' },
      date: LETZTER_DIENSTAG,
    });

    await service.unlink('hk', 'm1', ICH);

    expect(sessionUpdate).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { meetingId: null, version: { increment: 1 } },
    });
  });

  /** Dieselbe Grenze wie beim Wählen: der Abend gehört denen, die ihn halten. */
  it('weist ab, wer nicht zugeteilt ist', async () => {
    const { service } = setup({ session: { id: 's1', topicId: 't1' } });

    await expect(service.unlink('hk', 'm1', FREMD)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

/**
 * Die Zuteilung selbst — und die eine Angabe, die sie weiterreichen muss.
 *
 * Wer **dazukommt**, entscheidet über das Schicksal einer schon getroffenen
 * Wahl (`TopicLinkService.reconcile`). Ableiten lässt es sich dort nicht: Wenn
 * `reconcile` läuft, stehen die neuen Zeilen schon, und die alten sind weg.
 * Fiele die Angabe hier still unter den Tisch, verhielte sich alles wieder wie
 * vorher — ohne dass irgendetwas fehlschlüge.
 */
describe('setResponsibles', () => {
  it('reicht die Dazugekommenen an reconcile durch', async () => {
    const { service, links } = setup({ assigned: ['p1'] });

    await service.setResponsibles(
      'hk',
      'm1',
      { personIds: ['p1', 'p2'] },
      'p1',
    );

    expect(links.reconcile).toHaveBeenCalledWith(
      expect.anything(),
      'm1',
      ['p1', 'p2'],
      [],
      ['p2'],
    );
  });

  it('und die Herausgefallenen daneben', async () => {
    const { service, links } = setup({ assigned: ['p1', 'p2'] });

    await service.setResponsibles('hk', 'm1', { personIds: ['p3'] }, 'p1');

    expect(links.reconcile).toHaveBeenCalledWith(
      expect.anything(),
      'm1',
      ['p3'],
      ['p1', 'p2'],
      ['p3'],
    );
  });
});
