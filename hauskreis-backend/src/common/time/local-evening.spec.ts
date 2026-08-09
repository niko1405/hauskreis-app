import { eveningOf, eveningReached } from './local-evening';

/** So kommt ein `@db.Date` aus Prisma: Mitternacht UTC. */
function day(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

describe('eveningOf', () => {
  it('18 Uhr Sommerzeit ist 16:00 UTC', () => {
    expect(eveningOf(day('2026-08-11')).toISOString()).toBe(
      '2026-08-11T16:00:00.000Z',
    );
  });

  it('18 Uhr Winterzeit ist 17:00 UTC', () => {
    expect(eveningOf(day('2026-01-13')).toISOString()).toBe(
      '2026-01-13T17:00:00.000Z',
    );
  });

  // Die beiden Umstellungstage selbst — der Punkt, an dem eine feste
  // Stundenverschiebung falsch läge. Umgestellt wird nachts um zwei, der Abend
  // liegt also schon in der neuen Zeit.
  it('trifft den Tag der Umstellung auf Sommerzeit', () => {
    expect(eveningOf(day('2026-03-29')).toISOString()).toBe(
      '2026-03-29T16:00:00.000Z',
    );
  });

  it('trifft den Tag der Umstellung auf Winterzeit', () => {
    expect(eveningOf(day('2026-10-25')).toISOString()).toBe(
      '2026-10-25T17:00:00.000Z',
    );
  });
});

describe('eveningReached', () => {
  const abend = day('2026-08-11');

  it('am Morgen des Termintags noch nicht', () => {
    expect(eveningReached(abend, new Date('2026-08-11T09:00:00Z'))).toBe(false);
  });

  it('eine Minute vorher noch nicht', () => {
    expect(eveningReached(abend, new Date('2026-08-11T15:59:00Z'))).toBe(false);
  });

  it('ab 18 Uhr Ortszeit schon', () => {
    expect(eveningReached(abend, new Date('2026-08-11T16:00:00Z'))).toBe(true);
  });

  it('am Tag danach erst recht', () => {
    expect(eveningReached(abend, new Date('2026-08-12T08:00:00Z'))).toBe(true);
  });
});
