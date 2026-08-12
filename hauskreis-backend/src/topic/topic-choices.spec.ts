/**
 * Was zur Wahl steht (Spec §3, Optionen B und C).
 *
 * Zwei Dinge werden hier festgehalten. **Offene Einheiten stehen unter ihrem
 * Thema**, nicht als lose Liste — „Vergebung: Teil 2, Teil 3" liest sich als ein
 * Faden. Und **„offen" heißt nicht „an keinem Abend"**: eine Einheit, die am
 * falschen kommenden Dienstag hängt, steht mit zur Wahl und bringt ihren Termin
 * mit, damit die Rückfrage ein Datum nennen kann.
 */
import { TopicSessionService } from './topic-session.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TopicLinkService } from './topic-link.service';
import type { RoleAssignmentNotifier } from '../notification/role-assignment-notifier.service';
import type { AvailabilityService } from '../role-suggestion/availability.service';
import { withClock } from '../meeting/group-clock.testing';

const utc = (tag: string) => new Date(`2026-08-${tag}T00:00:00.000Z`);

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-08-05T12:00:00.000Z'));
});

afterAll(() => {
  jest.useRealTimers();
});

const VERGEBUNG = { id: 't1', title: 'Vergebung', status: 'RUNNING' };
const HOFFNUNG = { id: 't2', title: 'Hoffnung', status: 'COMPLETED' };

function setup(offene: Record<string, unknown>[]) {
  const sessionFind = jest.fn().mockResolvedValue(offene);

  const prisma = {
    meeting: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'm1',
        date: utc('11'),
        hasTopicSlot: true,
        topicResponsibles: [{ personId: 'p1' }],
        topicSession: null,
      }),
    },
    topic: { findMany: jest.fn().mockResolvedValue([]) },
    topicSession: { findMany: sessionFind },
  };

  const service = withClock(
    new TopicSessionService(
      prisma as unknown as PrismaService,
      { announce: jest.fn() } as unknown as RoleAssignmentNotifier,
      { assertAvailable: jest.fn() } as unknown as AvailabilityService,
      { join: jest.fn() } as unknown as TopicLinkService,
    ),
  );

  return { service, sessionFind };
}

const einheit = (
  id: string,
  topic: typeof VERGEBUNG,
  meeting: Record<string, unknown> | null = null,
) => ({ id, title: id, createdAt: utc('01'), meeting, topic });

describe('choices', () => {
  it('bündelt offene Einheiten unter ihrem Thema', async () => {
    const { service } = setup([
      einheit('a', VERGEBUNG),
      einheit('b', HOFFNUNG),
      einheit('c', VERGEBUNG),
    ]);

    const { openSessions } = await service.choices('hk', 'm1', 'p1');

    expect(openSessions).toHaveLength(2);
    expect(openSessions[0]?.topic).toEqual(VERGEBUNG);
    expect(openSessions[0]?.sessions.map((s) => s.id)).toEqual(['a', 'c']);
    expect(openSessions[1]?.topic).toEqual(HOFFNUNG);
  });

  /** Das Thema steht schon über der Gruppe — in der Zeile wäre es doppelt. */
  it('lässt das Thema aus den einzelnen Zeilen weg', async () => {
    const { service } = setup([einheit('a', VERGEBUNG)]);

    const { openSessions } = await service.choices('hk', 'm1', 'p1');

    expect(openSessions[0]?.sessions[0]).not.toHaveProperty('topic');
  });

  /**
   * Eine Einheit am falschen Dienstag bringt ihren Abend mit — ohne ihn ließe
   * sich nicht fragen, ob man ihn wirklich wegnehmen will.
   */
  it('reicht den fremden Abend mit durch', async () => {
    const fremd = { id: 'm-anders', date: utc('18'), title: null };
    const { service } = setup([einheit('a', VERGEBUNG, fremd)]);

    const { openSessions } = await service.choices('hk', 'm1', 'p1');

    expect(openSessions[0]?.sessions[0]?.meeting).toEqual(fremd);
  });

  describe('die Abfrage', () => {
    /**
     * Der NULL-Fall braucht einen eigenen Zweig: über die Relation gefragt,
     * verschluckt SQL ihn — `meeting is null` erfüllt weder `id != x` noch
     * dessen Gegenteil. Ohne den Zweig verschwänden alle Entwürfe.
     */
    it('fragt Entwürfe getrennt von fremden Abenden ab', async () => {
      const { service, sessionFind } = setup([]);

      await service.choices('hk', 'm1', 'p1');

      const { where } = sessionFind.mock.calls[0][0] as {
        where: { AND: [unknown, { OR: Record<string, unknown>[] }] };
      };

      expect(where.AND[1].OR[0]).toEqual({ meetingId: null });
    });

    /** Der eigene Abend gehört nicht in die Auswahl für ihn selbst. */
    it('schließt den eigenen Abend aus', async () => {
      const { service, sessionFind } = setup([]);

      await service.choices('hk', 'm1', 'p1');

      expect(JSON.stringify(sessionFind.mock.calls[0][0])).toContain(
        '"not":"m1"',
      );
    });

    /**
     * Spec 8.5: der eigene Entwurf bleibt greifbar, auch wenn der Owner die
     * Person als Mitarbeiterin entfernt hat. Dafür der dritte Zweig über die
     * Verantwortlichen der Einheit.
     */
    it('findet auch den eigenen Entwurf ohne Mitarbeit am Thema', async () => {
      const { service, sessionFind } = setup([]);

      await service.choices('hk', 'm1', 'p1');

      const { where } = sessionFind.mock.calls[0][0] as {
        where: { AND: [{ OR: Record<string, unknown>[] }, unknown] };
      };

      expect(where.AND[0].OR).toContainEqual({
        responsibles: { some: { personId: 'p1' } },
      });
    });
  });
});
