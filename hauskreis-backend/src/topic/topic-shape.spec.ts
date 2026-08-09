/**
 * „Session 2 von 2" — die Stelle eines Abends in seinem Thema.
 *
 * Reine Rechnung, deshalb ein reiner Test. Die einzige Entscheidung, die dabei
 * fällt: **Entwürfe zählen nicht mit.** Sie haben kein Datum, an dem sie sich
 * einsortieren ließen, und die Zahl spränge, sobald jemand nebenher einen
 * anfängt — für alle anderen sichtbar, obwohl sie den Entwurf gar nicht sehen.
 */
import { sessionPosition } from './topic-shape';

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
