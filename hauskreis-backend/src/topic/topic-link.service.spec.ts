/**
 * Was aus der gewählten Einheit wird, wenn sich die Zuteilung ändert.
 *
 * Die eine Regel, die hier geprüft wird: **entkoppelt wird, wenn niemand mehr
 * zugeteilt ist, der die Einheit vorbereitet** — und nur, solange der Abend
 * bevorsteht. Beide Hälften sind wichtig. Ohne die erste risse ein Austragen der
 * zweiten Person die Vorbereitung der ersten weg; ohne die zweite verschwände
 * eine Zusammenfassung rückwirkend aus dem Archiv, weil jemand eine Rolle
 * korrigiert.
 *
 * Hier stand einmal ein zweiter, viel größerer Teil: Wer dazukam, setzte die
 * Wahl zurück, es sei denn, der Owner trug ihn selbst ein, und fiel der Owner
 * heraus, ging die Einheit mit. Drei Regeln, die alle dasselbe Loch stopften —
 * dass die Abend-Rolle zugleich das Schreibrecht vergab. Seit beides getrennt
 * ist, braucht es keine davon mehr, und das Dazukommen tut wieder genau das,
 * wonach es aussieht: nichts.
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
}) {
  // Kein `??` auf `ownerPersonId`: `null` ist hier eine Aussage („verwaistes
  // Thema") und kein fehlender Wert, den man auffüllen dürfte.
  const owner = options.session ? options.session.ownerPersonId : 'p1';
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
    topic: { updateMany: topicTouch },
    topicSession: { update: sessionUpdate, updateMany: sessionTouch },
    topicSessionResponsible: {
      createMany: responsibleCreate,
      deleteMany: responsibleDelete,
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
    topicTouch,
  };
}

/** Ob die Revision der Einheit angehoben wurde — daran hängt ihr ETag. */
const angehoben = (fn: jest.Mock) =>
  fn.mock.calls.some(
    (call) => call[0]?.where?.id === 's1' && call[0]?.data?.version,
  );

/** Was `update` schreiben wollte. */
const entkoppelt = (fn: jest.Mock) =>
  fn.mock.calls[0]?.[0].data?.meetingId === null;

describe('TopicLinkService.reconcile', () => {
  it('lässt die Einheit hängen, solange eine zugeteilte Person sie vorbereitet', async () => {
    const { service, tx, sessionUpdate } = setup({
      session: { ownerPersonId: 'p1' },
    });

    await service.reconcile(tx, 'm1', ['p1']);

    expect(sessionUpdate).not.toHaveBeenCalled();
  });

  it('lässt sie auch hängen, wenn nur jemand anders ausgetragen wird', async () => {
    const { service, tx, sessionUpdate } = setup({
      session: { ownerPersonId: 'p1', collaboratorIds: ['p2'] },
    });

    await service.reconcile(tx, 'm1', ['p1']);

    expect(sessionUpdate).not.toHaveBeenCalled();
  });

  /**
   * Der Fall, der diese ganze Runde ausgelöst hat.
   *
   * Vorher sprang die Wahl weg, sobald jemand zur Rolle dazukam — gedacht als
   * Schutz einer fremden Vorbereitung, in der Benutzung ein Abend, der ohne
   * Zutun leer dastand. Er braucht den Schutz nicht mehr: Zugeteilt zu sein gibt
   * kein Schreibrecht, also gibt es auch nichts, wovor zu schützen wäre.
   */
  it('lässt sie hängen, wenn jemand Fremdes dazukommt', async () => {
    const { service, tx, sessionUpdate } = setup({
      session: { ownerPersonId: 'p1' },
    });

    await service.reconcile(tx, 'm1', ['p1', 'p9']);

    expect(sessionUpdate).not.toHaveBeenCalled();
  });

  /**
   * Und der zugehörige Rückbau: Ist der Owner nicht mehr zugeteilt, aber eine
   * Mitarbeiterin schon, bleibt die Einheit. Ein Thema über mehrere Abende darf
   * reihum gehalten werden.
   */
  it('lässt sie hängen, wenn der Owner geht und eine Mitarbeiterin bleibt', async () => {
    const { service, tx, sessionUpdate } = setup({
      session: { ownerPersonId: 'p1', collaboratorIds: ['p2'] },
    });

    await service.reconcile(tx, 'm1', ['p2']);

    expect(sessionUpdate).not.toHaveBeenCalled();
  });

  /**
   * Die dritte Quelle von „gehört dazu", und die neue: die Crew der Einheit.
   * p2 hängt am Thema nicht — er bereitet nur diesen einen Abend mit vor. Das
   * genügt.
   */
  it('lässt sie hängen, wenn jemand aus ihrer Crew zugeteilt bleibt', async () => {
    const { service, tx, sessionUpdate } = setup({
      session: { ownerPersonId: 'p1', responsibleIds: ['p1', 'p2'] },
    });

    await service.reconcile(tx, 'm1', ['p2']);

    expect(sessionUpdate).not.toHaveBeenCalled();
  });

  /**
   * Die andere Hälfte der Regel, die der Wunsch ausdrücklich mitbrachte: Es
   * genügt nicht, dass *irgendwer* zugeteilt ist. Hängt am Abend etwas, das
   * keiner der Zuständigen anfassen darf, ist der Abend in Wahrheit ungeplant.
   */
  it('entkoppelt, wenn nur noch Fremde zugeteilt sind', async () => {
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
   * Dabei wird **nichts** aufgeräumt: Der Entwurf wartet ab sofort auf genau
   * die Leute, die ihn vorbereitet haben. Nähme man ihnen die Zeile, verschwände
   * er aus ihrem „Angefangenes" — ein Entwurf, den niemand mehr sehen kann, ist
   * gelöscht, nur langsamer.
   */
  it('lässt der Crew ihre Einheit, wenn sie entkoppelt wird', async () => {
    const { service, tx, responsibleDelete, collaboratorDelete } = setup({
      session: { ownerPersonId: 'p1', collaboratorIds: ['p2'] },
    });

    await service.reconcile(tx, 'm1', ['p9']);

    expect(responsibleDelete).not.toHaveBeenCalled();
    expect(collaboratorDelete).not.toHaveBeenCalled();
  });

  /**
   * Ein Thema, an dem überhaupt niemand hängt — Altbestand aus der Zeit vor
   * diesem Modell. Dort gäbe es keine Vorbereitung zu schützen, und ohne diese
   * Ausnahme löste jede Rollenänderung es vom Abend.
   */
  it('lässt ein verwaistes Thema ohne Crew in Ruhe', async () => {
    const { service, tx, sessionUpdate } = setup({
      session: { ownerPersonId: null, responsibleIds: [] },
    });

    await service.reconcile(tx, 'm1', ['p9']);

    expect(sessionUpdate).not.toHaveBeenCalled();
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

    await service.reconcile(tx, 'm1', []);

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
 * Der zweite Weg, eine Einheit von ihrem Abend zu lösen: nicht weil die
 * Zuteilung es hergibt, sondern weil der Baustein „Thema" weggenommen wurde.
 *
 * Hier gilt die Sperre für die Vergangenheit **nicht** — sie schützt gegen die
 * beiläufige Änderung, und den Baustein abzuschalten ist die ausdrückliche
 * Aussage „der Abend hatte kein Thema". Bliebe die Einheit hängen, hätte er
 * danach weder Thema noch Platz für eine Nachbereitung.
 */
function setupDetach(date: Date) {
  const sessionUpdate = jest.fn().mockResolvedValue({});
  const topicTouch = jest.fn().mockResolvedValue({ count: 1 });
  const meetingTouch = jest.fn().mockResolvedValue({ count: 1 });

  const tx = {
    topicSession: { update: sessionUpdate },
    topic: { updateMany: topicTouch },
    meeting: { updateMany: meetingTouch },
  };

  const prisma = {
    meeting: {
      findUnique: jest.fn().mockResolvedValue({
        hauskreisId: 'hk-1',
        date,
        topicSession: { id: 's1', topicId: 't1' },
      }),
    },
    $transaction: jest.fn((run: (client: unknown) => unknown) => run(tx)),
  };

  const service = withClock(
    new TopicLinkService(prisma as unknown as PrismaService),
  );

  return { service, sessionUpdate, topicTouch, meetingTouch };
}

describe('TopicLinkService.detach', () => {
  it('löst einen kommenden Abend von seiner Einheit', async () => {
    const { service, sessionUpdate } = setupDetach(KOMMENDER_DIENSTAG);

    await expect(service.detach('m1')).resolves.toBe(true);
    expect(sessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 's1' },
        data: { meetingId: null, version: { increment: 1 } },
      }),
    );
  });

  it('lässt einen vergangenen Abend in Ruhe, solange niemand es verlangt', async () => {
    const { service, sessionUpdate } = setupDetach(LETZTER_DIENSTAG);

    await expect(service.detach('m1')).resolves.toBe(false);
    expect(sessionUpdate).not.toHaveBeenCalled();
  });

  it('löst ihn mit `evenIfPast` trotzdem', async () => {
    const { service, sessionUpdate, topicTouch, meetingTouch } =
      setupDetach(LETZTER_DIENSTAG);

    await expect(service.detach('m1', { evenIfPast: true })).resolves.toBe(
      true,
    );

    // Gelöst, nicht geleert: geschrieben wird ausschließlich `meetingId`.
    // Titel, Zusammenfassung, Actionstep und die Crew bleiben, wo sie sind —
    // die Einheit wartet ab jetzt als Entwurf bei denen, die sie gemacht haben.
    expect(sessionUpdate).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { meetingId: null, version: { increment: 1 } },
    });

    // Beide Seiten ändern ihre Antwort, also müssen beide Revisionen steigen —
    // sonst kommt der alte Stand als `304` zurück.
    expect(topicTouch).toHaveBeenCalled();
    expect(meetingTouch).toHaveBeenCalled();
  });

  it('tut nichts an einem Abend ohne Einheit', async () => {
    const prisma = {
      meeting: {
        findUnique: jest.fn().mockResolvedValue({
          hauskreisId: 'hk-1',
          date: LETZTER_DIENSTAG,
          topicSession: null,
        }),
      },
      $transaction: jest.fn(),
    };

    const service = withClock(
      new TopicLinkService(prisma as unknown as PrismaService),
    );

    await expect(service.detach('m1', { evenIfPast: true })).resolves.toBe(
      false,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

/**
 * Die beiden Griffe an der Crew einer Einheit.
 *
 * Sie schreiben genau eine Tabelle. Dass `join` daneben auch noch das
 * themaweite Schreibrecht vergab, war der automatische Rechte-Aufstieg, der
 * weggefallen ist — wer einmal an einem Abend aushilft, bekommt damit keine
 * Hoheit über ein Thema, das über Monate läuft.
 */
describe('TopicLinkService.join / leave', () => {
  it('trägt die Leute an der Einheit ein', async () => {
    const { service, tx, responsibleCreate } = setup({
      session: { ownerPersonId: 'p1' },
    });

    await service.join(tx, 's1', 't1', ['p2', 'p3']);

    expect(responsibleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          { sessionId: 's1', personId: 'p2' },
          { sessionId: 's1', personId: 'p3' },
        ],
      }),
    );
  });

  /** Der Regressionswächter für die Trennung. */
  it('macht dabei niemanden zum Mitarbeiter am Thema', async () => {
    const { service, tx, collaboratorCreate } = setup({
      session: { ownerPersonId: 'p1' },
    });

    await service.join(tx, 's1', 't1', ['p2']);

    expect(collaboratorCreate).not.toHaveBeenCalled();
  });

  /**
   * Wer an einer Einheit steht, steht in einer eigenen Tabelle — ihre eigene
   * Zeile bleibt dabei unberührt. Ohne einen Griff an die Revision bliebe der
   * ETag stehen, der Server antwortete `304`, und die Seite der Einheit zeigte
   * weiter den alten Kreis. Genau so ist es aufgefallen: „Ich habe jemanden
   * dazugetragen, aber dort steht immer noch nur ich."
   */
  it('hebt die Revision von Einheit und Thema an', async () => {
    const { service, tx, sessionTouch, topicTouch } = setup({
      session: { ownerPersonId: 'p1' },
    });

    await service.join(tx, 's1', 't1', ['p2']);

    expect(angehoben(sessionTouch)).toBe(true);
    expect(topicTouch).toHaveBeenCalled();
  });

  it('nimmt sie mit `leave` wieder heraus', async () => {
    const { service, tx, responsibleDelete } = setup({
      session: { ownerPersonId: 'p1' },
    });

    await service.leave(tx, 's1', 't1', ['p2']);

    expect(responsibleDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: 's1', personId: { in: ['p2'] } },
      }),
    );
  });

  /**
   * Auch den Owner. Ihm gehört das Thema, nicht jeder seiner Abende — dass er
   * den dritten jemand anderem überlässt, ist ein gültiger Zustand, und sein
   * Zugang hängt ohnehin an `topic.ownerPersonId`.
   */
  it('nimmt auch den Owner heraus, wenn man es verlangt', async () => {
    const { service, tx, responsibleDelete } = setup({
      session: { ownerPersonId: 'p1' },
    });

    await service.leave(tx, 's1', 't1', ['p1']);

    expect(responsibleDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: 's1', personId: { in: ['p1'] } },
      }),
    );
  });

  /** Und lässt das Schreibrecht am Thema in Ruhe — das verwaltet der Owner. */
  it('nimmt niemandem das Recht am Thema', async () => {
    const { service, tx, collaboratorDelete } = setup({
      session: { ownerPersonId: 'p1', collaboratorIds: ['p2'] },
    });

    await service.leave(tx, 's1', 't1', ['p2']);

    expect(collaboratorDelete).not.toHaveBeenCalled();
  });
});
