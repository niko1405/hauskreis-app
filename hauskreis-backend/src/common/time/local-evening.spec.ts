import { eveningOf, eveningReached } from './local-evening';

/** Die Zone der Gruppe. Die Erwartungen unten sind in Ortszeit gedacht. */
const BERLIN = 'Europe/Berlin';

/** So kommt ein `@db.Date` aus Prisma: Mitternacht UTC. */
function day(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

describe('eveningOf', () => {
  it('18 Uhr Sommerzeit ist 16:00 UTC', () => {
    expect(eveningOf(day('2026-08-11'), BERLIN).toISOString()).toBe(
      '2026-08-11T16:00:00.000Z',
    );
  });

  it('18 Uhr Winterzeit ist 17:00 UTC', () => {
    expect(eveningOf(day('2026-01-13'), BERLIN).toISOString()).toBe(
      '2026-01-13T17:00:00.000Z',
    );
  });

  // Die beiden Umstellungstage selbst — der Punkt, an dem eine feste
  // Stundenverschiebung falsch läge. Umgestellt wird nachts um zwei, der Abend
  // liegt also schon in der neuen Zeit.
  it('trifft den Tag der Umstellung auf Sommerzeit', () => {
    expect(eveningOf(day('2026-03-29'), BERLIN).toISOString()).toBe(
      '2026-03-29T16:00:00.000Z',
    );
  });

  it('trifft den Tag der Umstellung auf Winterzeit', () => {
    expect(eveningOf(day('2026-10-25'), BERLIN).toISOString()).toBe(
      '2026-10-25T17:00:00.000Z',
    );
  });

  it('nimmt die Uhrzeit des Termins, wenn eine dabeisteht', () => {
    // 19:30 Sommerzeit = 17:30 UTC. Die 18 sind nur noch der Rückfall.
    expect(
      eveningOf(day('2026-08-11'), BERLIN, 19 * 60 + 30).toISOString(),
    ).toBe('2026-08-11T17:30:00.000Z');
  });

  it('kommt auch mit einer Uhrzeit am Rand des Tages klar', () => {
    expect(eveningOf(day('2026-08-11'), BERLIN, 0).toISOString()).toBe(
      '2026-08-10T22:00:00.000Z',
    );
    expect(
      eveningOf(day('2026-08-11'), BERLIN, 23 * 60 + 59).toISOString(),
    ).toBe('2026-08-11T21:59:00.000Z');
  });
});

describe('eveningReached', () => {
  const abend = day('2026-08-11');

  it('am Morgen des Termintags noch nicht', () => {
    expect(
      eveningReached(abend, BERLIN, new Date('2026-08-11T09:00:00Z')),
    ).toBe(false);
  });

  it('eine Minute vorher noch nicht', () => {
    expect(
      eveningReached(abend, BERLIN, new Date('2026-08-11T15:59:00Z')),
    ).toBe(false);
  });

  it('ab 18 Uhr Ortszeit schon', () => {
    expect(
      eveningReached(abend, BERLIN, new Date('2026-08-11T16:00:00Z')),
    ).toBe(true);
  });

  it('am Tag danach erst recht', () => {
    expect(
      eveningReached(abend, BERLIN, new Date('2026-08-12T08:00:00Z')),
    ).toBe(true);
  });

  // Der eigentliche Grund für den Parameter: eine Gruppe, die sich um 20 Uhr
  // trifft, gab ihren Actionstep vorher zwei Stunden zu früh frei.
  it('wartet auf die spätere Anfangszeit', () => {
    const zwanzigUhr = 20 * 60;

    expect(
      eveningReached(
        abend,
        BERLIN,
        new Date('2026-08-11T16:00:00Z'),
        zwanzigUhr,
      ),
    ).toBe(false);
    expect(
      eveningReached(
        abend,
        BERLIN,
        new Date('2026-08-11T18:00:00Z'),
        zwanzigUhr,
      ),
    ).toBe(true);
  });

  it('gibt bei einer früheren Anfangszeit auch früher frei', () => {
    expect(
      eveningReached(abend, BERLIN, new Date('2026-08-11T14:00:00Z'), 16 * 60),
    ).toBe(true);
  });
});
