/**
 * Die Wächter für den Versions-Sprung.
 *
 * Der Fehler, den sie fernhalten, ist der am schwersten zu bemerkende: nichts
 * bricht, es kommt kein Fehler zurück, der Bildschirm zeigt nur den alten
 * Stand. Grund ist die ETag-Kette — die Revision einer Antwort kommt allein aus
 * `version` der **einen** Tabelle, die sie benennt. Wer ein Feld ändert, das in
 * der Antwort einer *anderen* Ressource steht, muss deren Version mit anheben,
 * sonst antwortet der Server mit `304`.
 *
 * Zwei Richtungen sind hier zu prüfen:
 *
 * - Eine **Einheit** zu ändern altert ihren Termin *und* ihr Thema. Der Termin
 *   trägt die Einheit in seiner Antwort, das Thema trägt sie in seiner Liste.
 * - Ein **Thema** zu ändern altert jeden Termin, an dem eine seiner Einheiten
 *   hängt — dort steht sein Titel als „Zugehöriges Thema".
 */
import { TopicService } from './topic.service';
import { TopicSessionService } from './topic-session.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TopicLinkService } from './topic-link.service';
import { withClock } from '../meeting/group-clock.testing';

/** Die Zone der Gruppe — in den Tests immer dieselbe. */
const BERLIN = 'Europe/Berlin';

const VIEWER = { personId: 'niko', isAdmin: false, zone: BERLIN };

/** Ein Thema, das dem Betrachter gehört — sonst kommt er nicht an den Schreibpfad. */
const MEINS = { ownerPersonId: 'niko', collaborators: [], standalone: false };

describe('updateSession', () => {
  function setup() {
    const sessionUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const meetingTouch = jest.fn().mockResolvedValue({ count: 1 });
    const topicTouch = jest.fn().mockResolvedValue({ count: 1 });

    const tx = {
      topicSession: { updateMany: sessionUpdate },
      meeting: { updateMany: meetingTouch },
      topic: { updateMany: topicTouch },
    };

    const prisma = {
      ...tx,
      topicSession: {
        ...tx.topicSession,
        findFirst: jest.fn().mockResolvedValue({
          id: 's1',
          meetingId: 'm1',
          topicId: 't1',
          topic: {
            id: 't1',
            ...MEINS,
            title: null,
            status: 'RUNNING',
            // `findSession` zählt daraus die Stelle im Thema.
            sessions: [{ id: 's1', meeting: null }],
          },
        }),
      },
      $transaction: (run: (client: typeof tx) => unknown) => run(tx),
    };

    const service = withClock(
      new TopicSessionService(
        prisma as unknown as PrismaService,
        {} as unknown as TopicLinkService,
      ),
    );

    return { service, meetingTouch, topicTouch, sessionUpdate };
  }

  it('lässt Termin und Thema mit altern', async () => {
    const { service, meetingTouch, topicTouch } = setup();

    await service.updateSession('hk-1', 's1', { title: 'Neu' }, VIEWER, {
      kind: 'any',
    });

    expect(meetingTouch).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'm1' } }),
    );
    expect(topicTouch).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 't1' } }),
    );
  });

  it('lässt nichts altern, wenn die Version nicht passte', async () => {
    const { service, meetingTouch, topicTouch, sessionUpdate } = setup();
    sessionUpdate.mockResolvedValue({ count: 0 });

    // Ein an der Version gescheiterter Schreibversuch hat nichts geändert. Ihn
    // trotzdem mitzuzählen hieße, jedem anderen Leser seinen gültigen ETag zu
    // entwerten, ohne dass sich etwas bewegt hat.
    await service
      .updateSession('hk-1', 's1', { title: 'Neu' }, VIEWER, {
        kind: 'version',
        version: 7,
      })
      .catch(() => undefined);

    expect(meetingTouch).not.toHaveBeenCalled();
    expect(topicTouch).not.toHaveBeenCalled();
  });
});

describe('TopicService.update', () => {
  it('altert jeden Termin, an dem eine Einheit des Themas hängt', async () => {
    const meetingTouch = jest.fn().mockResolvedValue({ count: 1 });

    const tx = {
      topic: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      topicSession: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ meetingId: 'm1' }, { meetingId: 'm2' }]),
      },
      meeting: { updateMany: meetingTouch },
    };

    const prisma = {
      ...tx,
      topic: {
        ...tx.topic,
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 't1', hauskreisId: 'hk-1', ...MEINS }),
      },
      $transaction: (run: (client: typeof tx) => unknown) => run(tx),
    };

    const service = withClock(
      new TopicService(prisma as unknown as PrismaService),
    );

    await service
      .update('hk-1', 't1', { title: 'Vergebung' }, VIEWER, { kind: 'any' })
      .catch(() => undefined);

    expect(meetingTouch).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'm1' } }),
    );
    expect(meetingTouch).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'm2' } }),
    );
  });
});
