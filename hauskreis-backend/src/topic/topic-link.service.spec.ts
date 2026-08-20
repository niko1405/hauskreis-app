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
  session?: {
    ownerPersonId: string | null;
    collaboratorIds?: string[];
    /** Wer an der Einheit selbst steht. Ohne Angabe: Owner und Mitarbeitende. */
    responsibleIds?: string[];
  } | null;
  /** Wer nach der Änderung noch an einer anderen Einheit des Themas hängt. */
  nochBeteiligt?: string[];
}) {
  const owner = options.session?.ownerPersonId ?? 'p1';
  const mitarbeit = options.session?.collaboratorIds ?? [];

  const session =
    options.session === null
      ? null
      : {
          id: 's1',
          topicId: 't1',
          responsibles: (
            options.session?.responsibleIds ??
            [owner, ...mitarbeit].filter((personId) => personId !== null)
          ).map((personId) => ({ personId })),
          topic: {
            ownerPersonId: owner,
            collaborators: mitarbeit.map((personId) => ({ personId })),
          },
        };

  const sessionUpdate = jest.fn().mockResolvedValue({});
  const sessionTouch = jest.fn().mockResolvedValue({ count: 1 });
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
    topicSession: { update: sessionUpdate, updateMany: sessionTouch },
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
    sessionTouch,
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

/** Ob die Revision der Einheit angehoben wurde — daran hängt ihr ETag. */
const angehoben = (fn: jest.Mock) =>
  fn.mock.calls.some(
    (call) => call[0]?.where?.id === 's1' && call[0]?.data?.version,
  );

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
   * Wer an einer Einheit steht, steht in einer eigenen Tabelle — ihre eigene
   * Zeile bleibt dabei unberührt. Ohne einen Griff an die Revision bliebe der
   * ETag stehen, der Server antwortete `304`, und die Seite der Einheit zeigte
   * weiter den alten Kreis. Genau so ist es aufgefallen: „Ich habe jemanden
   * dazugetragen, aber dort steht immer noch nur ich."
   */
  it('hebt die Revision der Einheit an, wenn jemand dazukommt', async () => {
    const { service, tx, sessionTouch } = setup({
      session: { ownerPersonId: 'p1' },
    });

    await service.reconcile(tx, 'm1', ['p1', 'p2']);

    expect(angehoben(sessionTouch)).toBe(true);
  });

  /** Und in die andere Richtung, wo derselbe 304 den Entfernten stehen ließ. */
  it('hebt sie auch an, wenn jemand herausfällt', async () => {
    const { service, tx, sessionTouch } = setup({
      session: { ownerPersonId: 'p1', collaboratorIds: ['p2'] },
    });

    await service.reconcile(tx, 'm1', ['p1'], { departing: ['p2'] });

    expect(angehoben(sessionTouch)).toBe(true);
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

    await service.reconcile(tx, 'm1', ['p1', 'p9'], { arriving: ['p9'] });

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

    await service.reconcile(tx, 'm1', ['p1', 'p9'], { arriving: ['p9'] });

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

    await service.reconcile(tx, 'm1', ['p1', 'p2'], { arriving: ['p2'] });

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
   * Die zweite Ausnahme, und die wichtigere: Das Zurücksetzen schützt eine
   * Vorbereitung vor fremdem Zugriff — nicht vor der Person, der sie gehört.
   * Wer das Thema gewählt hat, holt sich jemanden dazu, ohne es zu verlieren.
   */
  it('lässt sie hängen, wenn der Owner selbst jemanden dazuholt', async () => {
    const { service, tx, sessionUpdate, collaboratorCreate } = setup({
      session: { ownerPersonId: 'p1' },
    });

    await service.reconcile(tx, 'm1', ['p1', 'p9'], {
      arriving: ['p9'],
      actorPersonId: 'p1',
    });

    expect(sessionUpdate).not.toHaveBeenCalled();
    expect(collaboratorCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: [{ topicId: 't1', personId: 'p9' }] }),
    );
  });

  /**
   * Ein Mitarbeiter ist nicht der Owner. Er darf am Thema schreiben — aber
   * jemanden in *diese* Vorbereitung zu holen, ist die Entscheidung dessen, der
   * sie angefangen hat.
   */
  it('setzt zurück, wenn ein Mitarbeiter jemanden dazuholt', async () => {
    const { service, tx, sessionUpdate } = setup({
      session: { ownerPersonId: 'p1', collaboratorIds: ['p2'] },
    });

    await service.reconcile(tx, 'm1', ['p1', 'p2', 'p9'], {
      arriving: ['p9'],
      actorPersonId: 'p2',
    });

    expect(entkoppelt(sessionUpdate)).toBe(true);
  });

  /**
   * Und ein Thema ohne Owner hat keinen, der die Ausnahme in Anspruch nehmen
   * könnte. Ohne diese Prüfung fiele jede Zuteilung ohne handelnde Person unter
   * die Ausnahme — `null === undefined` ist zum Glück falsch, aber das soll
   * jemand festhalten.
   */
  it('kennt keine Ausnahme für ein verwaistes Thema', async () => {
    const { service, tx, sessionUpdate } = setup({
      session: { ownerPersonId: null },
    });

    await service.reconcile(tx, 'm1', ['p9'], { arriving: ['p9'] });

    expect(entkoppelt(sessionUpdate)).toBe(true);
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

    await service.reconcile(tx, 'm1', ['p1', 'p9'], { arriving: ['p9'] });

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

    await service.reconcile(tx, 'm1', ['p1'], { departing: ['p2'] });

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

    await service.reconcile(tx, 'm1', ['p1'], { departing: ['p2'] });

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

    await service.reconcile(tx, 'm1', ['p1'], { departing: ['p2'] });

    expect(entzogen(collaboratorDelete)).toEqual([]);
  });

  /**
   * Der Regressionswächter. Im gewöhnlichen Entkoppel-Zweig wartet der Entwurf
   * ab sofort auf genau die Leute, die eben herausgefallen sind — nähme man
   * ihnen die Zeile, verschwände er aus ihrem „Angefangenes" und wäre gelöscht,
   * nur langsamer. Hier fällt eine Mitarbeiterin heraus, während der Owner
   * ohnehin nicht zugeteilt war: Es bleibt niemand übrig, der zum Thema gehört.
   */
  it('räumt nichts auf, wenn die Einheit gerade entkoppelt wird', async () => {
    const { service, tx, sessionUpdate, responsibleDelete } = setup({
      session: { ownerPersonId: 'p1', collaboratorIds: ['p2'] },
    });

    await service.reconcile(tx, 'm1', ['p9'], { departing: ['p2'] });

    expect(entkoppelt(sessionUpdate)).toBe(true);
    expect(responsibleDelete).not.toHaveBeenCalled();
  });

  /** Spec 8.5: wer damals dabei war, war dabei. */
  it('nimmt niemandem einen Abend weg, der schon war', async () => {
    const { service, tx, responsibleDelete } = setup({
      date: LETZTER_DIENSTAG,
      session: { ownerPersonId: 'p1', collaboratorIds: ['p2'] },
    });

    await service.reconcile(tx, 'm1', ['p1'], { departing: ['p2'] });

    expect(responsibleDelete).not.toHaveBeenCalled();
  });
});

/**
 * **Mit dem Owner oder gar nicht.**
 *
 * Wer die Einheit gewählt hat, nimmt sie mit, wenn er aus der Zuteilung fällt —
 * auch dann, wenn jemand zugeteilt bleibt, den er selbst dazugeholt hat. Die
 * Mitwirkenden eines Abends sind seine Helfer und nicht seine Nachfolger; die
 * Vorbereitung gehört ihm.
 */
describe('TopicLinkService.reconcile — wenn der Owner geht', () => {
  it('nimmt die Einheit vom Abend, obwohl eine Mitarbeiterin bleibt', async () => {
    const { service, tx, sessionUpdate } = setup({
      session: { ownerPersonId: 'p1', collaboratorIds: ['p2'] },
    });

    await service.reconcile(tx, 'm1', ['p2'], { departing: ['p1'] });

    expect(entkoppelt(sessionUpdate)).toBe(true);
  });

  /** Und nimmt die anderen von ihr herunter — Einheit wie Thema. */
  it('räumt die Mitwirkenden ab', async () => {
    const { service, tx, responsibleDelete, collaboratorDelete } = setup({
      session: { ownerPersonId: 'p1', collaboratorIds: ['p2'] },
    });

    await service.reconcile(tx, 'm1', ['p2'], { departing: ['p1'] });

    expect(entzogen(responsibleDelete)).toEqual(['p2']);
    expect(entzogen(collaboratorDelete)).toEqual(['p2']);
  });

  /**
   * Ihn selbst nicht: Sein Zugang hängt an `topic.ownerPersonId`, und unter
   * „vorbereitet von" gehört er weiter an seine Einheit. Der Entwurf wartet auf
   * ihn.
   */
  it('lässt den Owner an seiner Einheit stehen', async () => {
    const { service, tx, responsibleDelete } = setup({
      session: { ownerPersonId: 'p1', collaboratorIds: ['p2'] },
    });

    await service.reconcile(tx, 'm1', ['p2'], { departing: ['p1'] });

    expect(entzogen(responsibleDelete)).not.toContain('p1');
  });

  /**
   * Am **Herausfallen** und nicht an „der Owner ist nicht zugeteilt": Ein Thema
   * über mehrere Abende darf reihum gehalten werden. Hier hält p2 einen Abend
   * von p1s Thema allein, und eine beliebige andere Rollenänderung darf ihm das
   * nicht wegnehmen.
   */
  it('lässt einen Abend in Ruhe, den ein Mitarbeiter ohne den Owner hält', async () => {
    const { service, tx, sessionUpdate } = setup({
      session: {
        ownerPersonId: 'p1',
        collaboratorIds: ['p2'],
        responsibleIds: ['p2'],
      },
    });

    await service.reconcile(tx, 'm1', ['p2'], { departing: ['p3'] });

    expect(sessionUpdate).not.toHaveBeenCalled();
  });

  /** Ein vergangener Abend bleibt auch hier eingefroren. */
  it('fasst einen vergangenen Abend nicht an', async () => {
    const { service, tx, sessionUpdate, responsibleDelete } = setup({
      date: LETZTER_DIENSTAG,
      session: { ownerPersonId: 'p1', collaboratorIds: ['p2'] },
    });

    await service.reconcile(tx, 'm1', ['p2'], { departing: ['p1'] });

    expect(sessionUpdate).not.toHaveBeenCalled();
    expect(responsibleDelete).not.toHaveBeenCalled();
  });
});
