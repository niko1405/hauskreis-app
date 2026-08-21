/**
 * „Session 2 von 2" — die Stelle eines Abends in seinem Thema.
 *
 * Reine Rechnung, deshalb ein reiner Test. Die einzige Entscheidung, die dabei
 * fällt: **Entwürfe zählen nicht mit.** Sie haben kein Datum, an dem sie sich
 * einsortieren ließen, und die Zahl spränge, sobald jemand nebenher einen
 * anfängt — für alle anderen sichtbar, obwohl sie den Entwurf gar nicht sehen.
 */
import { membershipOf, sessionPosition, shapeSession } from './topic-shape';

const abend = (id: string, tag: string) => ({
  id,
  meeting: { date: new Date(`2026-08-${tag}T00:00:00.000Z`) },
});

const entwurf = (id: string) => ({ id, meeting: null });

describe('sessionPosition', () => {
  it('zählt chronologisch, nicht in der Reihenfolge der Liste', () => {
    const geschwister = [abend('s2', '18'), abend('s1', '11')];

    expect(sessionPosition('s2', geschwister)).toEqual({
      sessionIndex: 2,
      sessionCount: 2,
    });
  });

  it('lässt Entwürfe draußen', () => {
    const geschwister = [abend('s1', '11'), entwurf('s-entwurf')];

    expect(sessionPosition('s1', geschwister)).toEqual({
      sessionIndex: 1,
      sessionCount: 1,
    });
  });

  it('ergibt bei einem einzelnen Abend „1 von 1"', () => {
    expect(sessionPosition('s1', [abend('s1', '11')])).toEqual({
      sessionIndex: 1,
      sessionCount: 1,
    });
  });

  /**
   * Sollte die Einheit selbst einmal nicht in der Liste stehen — eine
   * Geschwisterliste, die aus einem anderen Moment stammt —, hängt sie sich
   * hinten an, statt `0 von 2` zu behaupten.
   */
  it('hängt eine unbekannte Einheit hinten an', () => {
    expect(sessionPosition('s-fremd', [abend('s1', '11')])).toEqual({
      sessionIndex: 2,
      sessionCount: 2,
    });
  });
});

/**
 * Ob sich das Überthema wieder entfernen lässt.
 *
 * Der Grund, warum das ein eigenes Feld ist und nicht vorn aus `sessionCount`
 * gerechnet wird: `sessionCount` zählt nur Einheiten **mit** Abend (siehe oben).
 * Ein Entwurf daneben führte den Knopf also in eine Fehlermeldung.
 */
describe('shapeSession — mayUnname', () => {
  const OWNER = 'p1';
  const BERLIN = 'Europe/Berlin';

  const session = {
    id: 's1',
    topicId: 't1',
    meetingId: 'm1',
    title: null,
    actionstepText: null,
    summaryText: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 0,
    meeting: null,
    responsibles: [],
  };

  const thema = (standalone = false) => ({
    id: 't1',
    title: 'Apostelgeschichte',
    status: 'RUNNING',
    standalone,
    ownerPersonId: OWNER,
    collaborators: [{ personId: 'p2' }],
  });

  const darf = (
    personId: string,
    sessionTotal: number | undefined,
    standalone = false,
  ) =>
    shapeSession(
      session,
      thema(standalone),
      { personId, isAdmin: false, zone: BERLIN },
      sessionTotal,
    ).mayUnname;

  it('geht bei genau einer Einheit', () => {
    expect(darf(OWNER, 1)).toBe(true);
  });

  it('nicht mehr, sobald eine zweite dazukommt', () => {
    expect(darf(OWNER, 2)).toBe(false);
  });

  it('nicht für eine Mitarbeiterin — Titel und Zusammenfassung fallen weg', () => {
    expect(darf('p2', 1)).toBe(false);
  });

  it('nicht bei einer Hülle: dort gibt es kein Überthema', () => {
    expect(darf(OWNER, 1, true)).toBe(false);
  });

  /** Wo die Zahl fehlt, lieber ein Knopf zu wenig als einer in den 400er. */
  it('nicht, wo die Geschwisterzahl gar nicht mitkommt', () => {
    expect(darf(OWNER, undefined)).toBe(false);
  });
});

/** Ein Thema, so weit `membershipOf` es braucht. */
const thema = (standalone: boolean) => ({
  id: 't1',
  title: null,
  status: 'RUNNING',
  standalone,
  ownerPersonId: 'p1',
  collaborators: [] as { personId: string }[],
});

/**
 * Bei einer Hülle ist die Crew der Einheit die Mitwirkenden-Ebene.
 *
 * Eine Hülle *ist* ihre eine Einheit — die Unterscheidung, für die
 * `topic_collaborator` gebaut wurde („hilft einmal aus" gegen „arbeitet am
 * ganzen Thema"), hat dort keinen Gegenstand. Bei einem richtigen Thema bleibt
 * sie bestehen, und das ist der Punkt: Wer einmal aushilft, bekommt keine
 * Hoheit über etwas, das über Monate läuft.
 */
describe('membershipOf', () => {
  it('nimmt bei einer Hülle die Crew hinein', () => {
    expect(membershipOf(thema(true), ['p1', 'p2']).collaboratorIds).toEqual([
      'p1',
      'p2',
    ]);
  });

  it('bei einem richtigen Thema nicht', () => {
    expect(membershipOf(thema(false), ['p1', 'p2']).collaboratorIds).toEqual(
      [],
    );
  });

  it('zählt niemanden doppelt', () => {
    const mit = { ...thema(true), collaborators: [{ personId: 'p2' }] };

    expect(membershipOf(mit, ['p2', 'p3']).collaboratorIds).toEqual([
      'p2',
      'p3',
    ]);
  });

  /**
   * Ohne Crew gefragt heißt: nach dem Thema allein gefragt. Die thema-weiten
   * Operationen tun das, und für eine Hülle sind sie ohnehin Owner-gebunden.
   */
  it('bleibt ohne Crew beim Owner', () => {
    expect(membershipOf(thema(true)).collaboratorIds).toEqual([]);
  });
});
