/**
 * Was aus der gewählten Einheit wird, wenn sich die Zuteilung ändert.
 *
 * Die eine Regel, die hier geprüft wird: **entkoppelt wird, wenn niemand mehr
 * zugeteilt ist, der zum Thema gehört** — und nur, solange der Abend bevorsteht.
 * Beide Hälften sind wichtig. Ohne die erste risse ein Austragen der zweiten
 * Person die Vorbereitung der ersten weg; ohne die zweite verschwände eine
 * Zusammenfassung rückwirkend aus dem Archiv, weil jemand eine Rolle korrigiert.
 */
import { TopicLinkService } from './topic-link.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { withClock } from '../meeting/group-clock.testing';

const HEUTE = new Date('2026-08-05T12:00:00.000Z');
const KOMMENDER_DIENSTAG = new Date('2026-08-11T00:00:00.000Z');
const LETZTER_DIENSTAG = new Date('2026-07-28T00:00:00.000Z');

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(HEUTE);
});

afterAll(() => {
  jest.useRealTimers();
});

function setup(options: {
  date?: Date;
  session?: { ownerPersonId: string | null; collaboratorIds?: string[] } | null;
  /** Wer nach der Änderung noch an einer anderen Einheit des Themas hängt. */
  nochBeteiligt?: string[];
}) {
  const session =
    options.session === null
      ? null
      : {
          id: 's1',
          topicId: 't1',
          topic: {
            ownerPersonId: options.session?.ownerPersonId ?? 'p1',
            collaborators: (options.session?.collaboratorIds ?? []).map(
              (personId) => ({ personId }),
            ),
          },
        };

  const sessionUpdate = jest.fn().mockResolvedValue({});
  const responsibleCreate = jest.fn().mockResolvedValue({ count: 0 });
  const responsibleDelete = jest.fn().mockResolvedValue({ count: 0 });
  const responsibleFind = jest
    .fn()
    .mockResolvedValue(
      (options.nochBeteiligt ?? []).map((personId) => ({ personId })),
    );
  const collaboratorCreate = jest.fn().mockResolvedValue({ count: 0 });
  const collaboratorDelete = jest.fn().mockResolvedValue({ count: 0 });
  const meetingTouch = jest.fn().mockResolvedValue({ count: 1 });
  const topicTouch = jest.fn().mockResolvedValue({ count: 1 });

  const tx = {
    meeting: {
      findUnique: jest.fn().mockResolvedValue({
        date: options.date ?? KOMMENDER_DIENSTAG,
        topicSession: session,
      }),
      updateMany: meetingTouch,
    },
    topic: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ ownerPersonId: session?.topic.ownerPersonId }),
      updateMany: topicTouch,
    },
    topicSession: { update: sessionUpdate },
    topicSessionResponsible: {
      createMany: responsibleCreate,
      deleteMany: responsibleDelete,
      findMany: responsibleFind,
    },
    topicCollaborator: {
      createMany: collaboratorCreate,
      deleteMany: collaboratorDelete,
    },
  };

  const service = withClock(
    new TopicLinkService({} as unknown as PrismaService),
  );

  return {
    service,
    tx: tx as unknown as Prisma.TransactionClient,
    sessionUpdate,
    responsibleCreate,
    responsibleDelete,
    collaboratorCreate,
    collaboratorDelete,
    meetingTouch,
  };
}

/** Wessen Mitarbeit `deleteMany` wegnehmen wollte. */
const entzogen = (fn: jest.Mock): string[] =>
  (fn.mock.calls[0]?.[0].where?.personId?.in as string[]) ?? [];

/** Was `update` schreiben wollte. */
const entkoppelt = (fn: jest.Mock) =>
  fn.mock.calls[0]?.[0].data?.meetingId === null;

describe('TopicLinkService.reconcile', () => {
  it('lässt die Einheit hängen, solange eine zugeteilte Person zum Thema gehört', async () => {
    const { service, tx, sessionUpdate } = setup({
      session: { ownerPersonId: 'p1' },
    });

    await service.reconcile(tx, 'm1', ['p1']);

    expect(sessionUpdate).not.toHaveBeenCalled();
  });

  /**
   * Der Fall, der die Spec beim Wort genommen falsch entschieden hätte: dort
   * steht „neue Person zugeteilt, alte entfernt → entkoppeln". Hier wurde nur
   * eine *dritte* Person ausgetragen, und p1 bereitet weiter vor.
   */
  it('lässt sie auch hängen, wenn nur jemand anders ausgetragen wird', async () => {
    const { service, tx, sessionUpdate } = setup({
      session: { ownerPersonId: 'p1', collaboratorIds: ['p2'] },
    });

    await service.reconcile(tx, 'm1', ['p1']);

    expect(sessionUpdate).not.toHaveBeenCalled();
  });

  it('entkoppelt, wenn stattdessen jemand Fremdes zugeteilt wird', async () => {
    const { service, tx, sessionUpdate } = setup({
      session: { ownerPersonId: 'p1' },
    });

    await service.reconcile(tx, 'm1', ['p9']);

    expect(entkoppelt(sessionUpdate)).toBe(true);
  });

  it('entkoppelt, wenn niemand mehr zugeteilt ist', async () => {
    const { service, tx, sessionUpdate } = setup({
      session: { ownerPersonId: 'p1' },
    });

    await service.reconcile(tx, 'm1', []);

    expect(entkoppelt(sessionUpdate)).toBe(true);
  });

  /**
   * Ohne `arriving` steht hier nur: die Liste ist jetzt so. Dann gilt weiter,
   * was immer galt — jede:r Zugeteilte hält mit und darf am Thema schreiben.
   */
  it('nimmt die Zugeteilten in Einheit und Thema auf', async () => {
    const { service, tx, responsibleCreate, collaboratorCreate } = setup({
      session: { ownerPersonId: 'p1' },
    });

    await service.reconcile(tx, 'm1', ['p1', 'p2']);

    expect(responsibleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          { sessionId: 's1', personId: 'p1' },
          { sessionId: 's1', personId: 'p2' },
        ],
      }),
    );
    // Der Owner steht nicht zusätzlich in der Mitarbeiter-Liste.
    expect(collaboratorCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [{ topicId: 't1', personId: 'p2' }],
      }),
    );
  });

  /**
   * Kommt jemand dazu, der zum Thema nicht gehört, fällt die Wahl zurück an
   * alle Zugeteilten. p1 bereitet weiter vor und bliebe nach der alten Regel
   * hängen — aber p9 hat diese Einheit nie gewählt und soll nicht still in eine
   * fremde Vorbereitung hineinrutschen.
   */
  it('setzt die Wahl zurück, wenn jemand Fremdes dazukommt', async () => {
    const { service, tx, sessionUpdate } = setup({
      session: { ownerPersonId: 'p1' },
    });

    await service.reconcile(tx, 'm1', ['p1', 'p9'], [], ['p9']);

    expect(entkoppelt(sessionUpdate)).toBe(true);
  });

  /**
   * Und dabei wird nichts aufgeräumt: Der Entwurf wartet ab sofort auf p1, und
   * ohne seine Zeile fände er ihn nicht wieder.
   */
  it('lässt dem bisherigen Zuständigen dabei seine Einheit', async () => {
    const { service, tx, responsibleDelete } = setup({
      session: { ownerPersonId: 'p1' },
    });

    await service.reconcile(tx, 'm1', ['p1', 'p9'], [], ['p9']);

    expect(responsibleDelete).not.toHaveBeenCalled();
  });

  /**
   * Die Ausnahme, und der Grund für sie: Wer am Thema ohnehin schon mitschreibt,
   * entscheidet mit dieser Zuteilung nichts Neues. Ihn erst hinauszuwerfen, um
   * ihn gleich wieder wählen zu lassen, wäre eine Zeremonie.
   */
  it('lässt sie hängen, wenn die dazugekommene Person zum Thema gehört', async () => {
    const { service, tx, sessionUpdate, responsibleCreate } = setup({
      session: { ownerPersonId: 'p1', collaboratorIds: ['p2'] },
    });

    await service.reconcile(tx, 'm1', ['p1', 'p2'], [], ['p2']);

    expect(sessionUpdate).not.toHaveBeenCalled();
    expect(responsibleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          { sessionId: 's1', personId: 'p1' },
          { sessionId: 's1', personId: 'p2' },
        ],
      }),
    );
  });

  /**
   * Der eingefrorene Fall. Was war, war — die Zusammenfassung eines vergangenen
   * Abends verschwindet nicht, weil jemand die Rolle nachträglich korrigiert.
   */
  it('fasst einen vergangenen Abend nicht an', async () => {
    const { service, tx, sessionUpdate } = setup({
      date: LETZTER_DIENSTAG,
      session: { ownerPersonId: 'p1' },
    });

    await service.reconcile(tx, 'm1', ['p9']);

    expect(sessionUpdate).not.toHaveBeenCalled();
  });

  /** Auch nicht, wenn jemand dazukommt: Was gehalten wurde, bleibt gehalten. */
  it('setzt an einem vergangenen Abend nichts zurück', async () => {
    const { service, tx, sessionUpdate } = setup({
      date: LETZTER_DIENSTAG,
      session: { ownerPersonId: 'p1' },
    });

    await service.reconcile(tx, 'm1', ['p1', 'p9'], [], ['p9']);

    expect(sessionUpdate).not.toHaveBeenCalled();
  });

  it('tut nichts, wenn noch gar nichts gewählt wurde', async () => {
    const { service, tx, sessionUpdate } = setup({ session: null });

    await service.reconcile(tx, 'm1', ['p9']);

    expect(sessionUpdate).not.toHaveBeenCalled();
  });

  /**
   * Der Termin ändert sich auch dann, wenn die Einheit unberührt bleibt — seine
   * Zuteilung steht mit in seiner Antwort. Ohne diesen Griff bliebe sein ETag
   * stehen, der Server antwortete `304`, und der Bildschirm zeigte weiter den
   * alten Stand. Genau das war der Fehler, den man als „aktualisiert sich erst
   * nach einem Reload" bemerkt hat.
   */
  it('hebt die Revision des Termins an', async () => {
    const { service, tx, meetingTouch } = setup({ session: null });

    await service.reconcile(tx, 'm1', ['p9']);

    expect(meetingTouch).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'm1' } }),
    );
  });
});

/**
 * Wer aus der Zuteilung fällt, bereitet diesen Abend nicht mehr vor.
 *
 * Zwei Rechte, zwei Antworten: die Zeile an *dieser* Einheit fällt immer, das
 * Schreibrecht am **Thema** nur, wenn die Person sonst nirgends mehr daran hängt.
 */
describe('TopicLinkService.reconcile — wer herausfällt', () => {
  it('nimmt die entfernte Person aus der Einheit des Abends', async () => {
    const { service, tx, responsibleDelete } = setup({
      session: { ownerPersonId: 'p1', collaboratorIds: ['p2'] },
    });

    await service.reconcile(tx, 'm1', ['p1'], ['p2']);

    expect(responsibleDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: 's1', personId: { in: ['p2'] } },
      }),
    );
  });

  it('nimmt ihr auch das Schreibrecht am Thema', async () => {
    const { service, tx, collaboratorDelete } = setup({
      session: { ownerPersonId: 'p1', collaboratorIds: ['p2'] },
    });

    await service.reconcile(tx, 'm1', ['p1'], ['p2']);

    expect(entzogen(collaboratorDelete)).toEqual(['p2']);
  });

  /**
   * Wer einen früheren Abend desselben Themas gehalten hat — oder für einen
   * späteren eingetragen ist — bleibt Mitarbeiter:in. Das Recht hängt am Thema,
   * nicht an dem einen Abend, aus dem die Person gerade herausfällt.
   */
  it('lässt es stehen, wenn sie an einer anderen Einheit hängt', async () => {
    const { service, tx, collaboratorDelete } = setup({
      session: { ownerPersonId: 'p1', collaboratorIds: ['p2'] },
      nochBeteiligt: ['p2'],
    });

    await service.reconcile(tx, 'm1', ['p1'], ['p2']);

    expect(entzogen(collaboratorDelete)).toEqual([]);
  });

  /**
   * Weder das Schreibrecht noch die Zeile an der Einheit. Unter „vorbereitet
   * von" stünde er sonst nicht mehr — an einer Einheit, die ihm gehört.
   */
  it('fasst den Owner nicht an', async () => {
    const { service, tx, collaboratorDelete, responsibleDelete } = setup({
      session: { ownerPersonId: 'p1', collaboratorIds: ['p2'] },
    });

    // p1 gehört zum Thema, die Einheit bleibt also hängen; ausgetragen wird der
    // Owner selbst.
    await service.reconcile(tx, 'm1', ['p2'], ['p1']);

    expect(entzogen(collaboratorDelete)).toEqual([]);
    expect(responsibleDelete).not.toHaveBeenCalled();
  });

  /**
   * Der Regressionswächter. Im Entkoppel-Zweig wartet der Entwurf ab sofort auf
   * genau die Leute, die eben herausgefallen sind — nähme man ihnen die Zeile,
   * verschwände er aus ihrem „Angefangenes" und wäre gelöscht, nur langsamer.
   */
  it('räumt nichts auf, wenn die Einheit gerade entkoppelt wird', async () => {
    const { service, tx, sessionUpdate, responsibleDelete } = setup({
      session: { ownerPersonId: 'p1' },
    });

    await service.reconcile(tx, 'm1', ['p9'], ['p1']);

    expect(entkoppelt(sessionUpdate)).toBe(true);
    expect(responsibleDelete).not.toHaveBeenCalled();
  });

  /** Spec 8.5: wer damals dabei war, war dabei. */
  it('nimmt niemandem einen Abend weg, der schon war', async () => {
    const { service, tx, responsibleDelete } = setup({
      date: LETZTER_DIENSTAG,
      session: { ownerPersonId: 'p1', collaboratorIds: ['p2'] },
    });

    await service.reconcile(tx, 'm1', ['p1'], ['p2']);

    expect(responsibleDelete).not.toHaveBeenCalled();
  });
});
