import { z } from 'zod';
import { isoDateOut, isoDateTimeOut } from './response';

/**
 * Der Punkt dieser Tests ist nicht, dass Zod funktioniert, sondern dass ein
 * `@db.Date`-Feld auf **keinem** Weg als Zeitstempel hinausgeht. Der Weg dorthin
 * führt über einen `transform()` mit `.pipe()`, und beides lässt sich beim
 * Aufräumen leicht als überflüssig missverstehen.
 */
describe('isoDateOut', () => {
  it('schneidet den Zeitanteil ab, den Prisma an @db.Date-Spalten hängt', () => {
    expect(isoDateOut.parse('2026-08-11T00:00:00.000Z')).toBe('2026-08-11');
  });

  it('lässt einen bereits zugeschnittenen Tag unverändert', () => {
    expect(isoDateOut.parse('2026-08-11')).toBe('2026-08-11');
  });

  it('nimmt auch einen Zeitstempel mit Offset', () => {
    expect(isoDateOut.parse('2026-08-11T02:00:00+02:00')).toBe('2026-08-11');
  });

  it('weist ab, was gar kein Datum ist', () => {
    expect(isoDateOut.safeParse('irgendwann').success).toBe(false);
    expect(isoDateOut.safeParse('2026-13-01').success).toBe(false);
  });

  it('beschreibt sich nach außen als reiner Tag', () => {
    // Das ist die eigentliche Zusage an das Frontend: in der OpenAPI-Datei
    // steht `format: date`, kein Oder aus Tag und Zeitstempel. Ohne das
    // `.pipe()` in `isoDateOut` stünde hier ein `anyOf`.
    const schema = z.toJSONSchema(z.object({ tag: isoDateOut }), {
      io: 'output',
    }) as { properties: { tag: { type: string; format: string } } };

    expect(schema.properties.tag.type).toBe('string');
    expect(schema.properties.tag.format).toBe('date');
  });
});

describe('isoDateTimeOut', () => {
  it('bleibt ein Zeitpunkt — createdAt und Co. sind keine Tage', () => {
    expect(isoDateTimeOut.parse('2026-07-31T21:46:43.444Z')).toBe(
      '2026-07-31T21:46:43.444Z',
    );
    expect(isoDateTimeOut.safeParse('2026-07-31').success).toBe(false);
  });
});
