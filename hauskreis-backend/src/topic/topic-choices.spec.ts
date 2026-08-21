/**
 * Was zur Wahl steht.
 *
 * Die Trennlinie, um die es hier geht: ein **Thema fortsetzen** (dort eine neue
 * Einheit anlegen) oder eine **fertige Einheit nehmen**. `topics` lässt die
 * Hüllen weg, `singleSessions` trägt alles, was ich vorbereite — auch unter
 * einem fremden Thema.
 *
 * Zwei Flaggen tragen die Anzeige: `resumable` sagt, ob sich die Einheit
 * hierher holen lässt, `held`, ob ihr Abend schon war. Sie fallen auseinander,
 * und genau das ist der Punkt — was schon war, lässt sich nicht mehr nehmen,
 * aber immer noch zu einem Thema machen.
 */
import { TopicSessionService } from './topic-session.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TopicLinkService } from './topic-link.service';
import type { RoleAssignmentNotifier } from '../notification/role-assignment-notifier.service';
import type { RoleAttendanceService } from '../attendance/role-attendance.service';
import type { AvailabilityService } from '../role-suggestion/availability.service';
import { withClock } from '../meeting/group-clock.testing';

const utc = (tag: string) => new Date(`2026-08-${tag}T00:00:00.000Z`);

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-08-05T12:00:00.000Z'));
});

afterAll(() => {
  jest.useRealTimers();
});

function setup(
  einzelne: Record<string, unknown>[],
  themen: Record<string, unknown>[] = [],
) {
  const sessionFind = jest.fn().mockResolvedValue(einzelne);
  const topicFind = jest.fn().mockResolvedValue(themen);

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
    topic: { findMany: topicFind },
    topicSession: { findMany: sessionFind },
  };

  const service = withClock(
    new TopicSessionService(
      prisma as unknown as PrismaService,
      { announce: jest.fn() } as unknown as RoleAssignmentNotifier,
      { confirm: jest.fn() } as unknown as RoleAttendanceService,
      { assertAvailable: jest.fn() } as unknown as AvailabilityService,
      { join: jest.fn() } as unknown as TopicLinkService,
    ),
  );

  return { service, sessionFind, topicFind };
}

const einheit = (
  id: string,
  meeting: Record<string, unknown> | null = null,
  topic: Record<string, unknown> = {
    id: 't-hülle',
    title: null,
    standalone: true,
  },
) => ({ id, title: id, createdAt: utc('01'), topic, meeting });

const abend = (tag: string, status = 'PLANNED') => ({
  id: `m-${tag}`,
  date: utc(tag),
  status,
  title: null,
});

describe('choices', () => {
  it('reicht die einzelnen Einheiten als flache Liste durch', async () => {
    const { service } = setup([einheit('a'), einheit('b')]);

    const { singleSessions } = await service.choices('hk', 'm1', 'p1');

    expect(singleSessions.map((session) => session.id)).toEqual(['a', 'b']);
  });

  /**
   * Der Abend kommt mit, weil die Rückfrage vor dem Umhängen ein Datum nennen
   * muss: „Die hängt am 18.08. — wirklich wegnehmen?"
   */
  it('reicht den fremden Abend mit durch', async () => {
    const { service } = setup([einheit('a', abend('18'))]);

    const { singleSessions } = await service.choices('hk', 'm1', 'p1');

    expect(singleSessions[0]?.meeting).toEqual({
      id: 'm-18',
      date: utc('18'),
      title: null,
    });
  });

  describe('resumable und held', () => {
    it('ein Entwurf ohne Abend lässt sich holen und war nicht', async () => {
      const { service } = setup([einheit('a')]);

      const [session] = (await service.choices('hk', 'm1', 'p1'))
        .singleSessions;

      expect(session).toMatchObject({ resumable: true, held: false });
    });

    it('ein kommender Abend lässt sich holen', async () => {
      const { service } = setup([einheit('a', abend('18'))]);

      const [session] = (await service.choices('hk', 'm1', 'p1'))
        .singleSessions;

      expect(session).toMatchObject({ resumable: true, held: false });
    });

    /**
     * Der Fall, für den es zwei Flaggen braucht: nicht mehr zu holen, aber
     * genau die Einheit, aus der man ein Thema machen will.
     */
    it('ein vergangener Abend ist gehalten und nicht mehr zu holen', async () => {
      const { service } = setup([einheit('a', abend('01'))]);

      const [session] = (await service.choices('hk', 'm1', 'p1'))
        .singleSessions;

      expect(session).toMatchObject({ resumable: false, held: true });
    });

    /** Abgesagt heißt: er war nicht. Zu holen ist er trotzdem nicht mehr. */
    it('ein abgesagter vergangener Abend gilt nicht als gehalten', async () => {
      const { service } = setup([einheit('a', abend('01', 'CANCELLED'))]);

      const [session] = (await service.choices('hk', 'm1', 'p1'))
        .singleSessions;

      expect(session).toMatchObject({ resumable: false, held: false });
    });
  });

  describe('die Abfrage', () => {
    /** Eine Hülle ist kein Thema — unter „Thema fortsetzen" sagte sie nichts. */
    it('lässt Hüllen aus der Themenliste heraus', async () => {
      const { service, topicFind } = setup([]);

      await service.choices('hk', 'm1', 'p1');

      expect(topicFind.mock.calls[0][0]).toMatchObject({
        where: { standalone: false },
      });
    });

    /**
     * Und umgekehrt: die zweite Liste fragt **nicht** mehr nach Hüllen.
     *
     * Sie tat es einmal, und das ging nicht mehr auf, seit die Vorbereitung
     * ihren eigenen Kreis zieht: Legt jemand die dritte Einheit seines Themas an
     * und nimmt mich dazu, gehöre ich zum *Thema* nicht — die Einheit stünde
     * damit in keiner der beiden Listen und wäre an meinem Abend nicht wählbar,
     * obwohl ich sie mit vorbereite.
     */
    it('fragt die Einheiten themaübergreifend ab', async () => {
      const { service, sessionFind } = setup([]);

      await service.choices('hk', 'm1', 'p1');

      const { where } = sessionFind.mock.calls[0][0] as {
        where: { topic: Record<string, unknown> };
      };

      expect(where.topic).toEqual({ hauskreisId: 'hk' });
    });

    /** Die Hüllen kommen über den zweiten Zweig — dort führt kein Weg über `topics`. */
    it('nimmt die alleinstehenden Einheiten der eigenen Themen mit', async () => {
      const { service, sessionFind } = setup([]);

      await service.choices('hk', 'm1', 'p1');

      const { where } = sessionFind.mock.calls[0][0] as {
        where: { OR: Record<string, unknown>[] };
      };

      expect(where.OR).toContainEqual({
        topic: {
          standalone: true,
          OR: [
            { ownerPersonId: 'p1' },
            { collaborators: { some: { personId: 'p1' } } },
          ],
        },
      });
    });

    /**
     * Ausgeschrieben und nicht als `NOT`: Die kurze Fassung wirft in SQL jeden
     * Entwurf mit weg, und die sind der Normalfall. Warum, steht in
     * `topic-choices-sql.spec.ts` — dort auch der Beweis, dass es so bleibt.
     */
    it('schließt den eigenen Abend aus, ohne die Entwürfe zu verlieren', async () => {
      const { service, sessionFind } = setup([]);

      await service.choices('hk', 'm1', 'p1');

      expect(sessionFind.mock.calls[0][0]).toMatchObject({
        where: {
          AND: [{ OR: [{ meetingId: null }, { meetingId: { not: 'm1' } }] }],
        },
      });
    });

    /**
     * Der Hauptzweig: was ich vorbereite. Deckt zugleich Spec 8.5 ab — der
     * eigene Entwurf bleibt greifbar, auch wenn der Owner die Person als
     * Mitarbeiterin entfernt hat.
     */
    it('findet jede Einheit, die ich vorbereite', async () => {
      const { service, sessionFind } = setup([]);

      await service.choices('hk', 'm1', 'p1');

      const { where } = sessionFind.mock.calls[0][0] as {
        where: { OR: Record<string, unknown>[] };
      };

      expect(where.OR).toContainEqual({
        responsibles: { some: { personId: 'p1' } },
      });
    });
  });
});
