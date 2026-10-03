import {
  addDays,
  currentDay,
  isLastOfMonth,
  isPast,
  nextWeekdayAfter,
  spanIsPast,
  toUtcDate,
  upcomingMeetingDates,
} from './meeting-schedule';

const BERLIN = 'Europe/Berlin';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

/** Wie `Date.getUTCDay()` zählt: 0 = Sonntag. */
const TUESDAY = 2;
const THURSDAY = 4;

describe('nextWeekdayAfter', () => {
  it('returns the coming Tuesday from a mid-week day', () => {
    // 2026-07-27 is a Monday.
    expect(iso(nextWeekdayAfter(utc('2026-07-27'), TUESDAY))).toBe(
      '2026-07-28',
    );
  });

  it('skips to the following week when given a Tuesday', () => {
    expect(iso(nextWeekdayAfter(utc('2026-07-28'), TUESDAY))).toBe(
      '2026-08-04',
    );
  });

  it('crosses a month boundary', () => {
    expect(iso(nextWeekdayAfter(utc('2026-07-29'), TUESDAY))).toBe(
      '2026-08-04',
    );
  });

  it('ignores the time of day', () => {
    expect(
      iso(nextWeekdayAfter(new Date('2026-07-27T23:59:59.000Z'), TUESDAY)),
    ).toBe('2026-07-28');
  });

  it('findet jeden anderen Wochentag genauso', () => {
    // Der Wochentag stand als Konstante im Modul; hier zeigt sich, dass er es
    // nicht mehr tut.
    expect(iso(nextWeekdayAfter(utc('2026-07-27'), THURSDAY))).toBe(
      '2026-07-30',
    );
  });
});

describe('upcomingMeetingDates', () => {
  const reihe = (options: {
    from: string;
    weekday?: number;
    count?: number;
    everyWeeks?: number;
    anchor?: string | null;
  }) =>
    upcomingMeetingDates({
      from: utc(options.from),
      weekday: options.weekday ?? TUESDAY,
      count: options.count ?? 4,
      everyWeeks: options.everyWeeks ?? 1,
      anchor: options.anchor ? utc(options.anchor) : null,
    }).map(iso);

  it('returns consecutive Tuesdays', () => {
    expect(reihe({ from: '2026-07-27' })).toEqual([
      '2026-07-28',
      '2026-08-04',
      '2026-08-11',
      '2026-08-18',
    ]);
  });

  it('returns nothing when asked for nothing', () => {
    expect(reihe({ from: '2026-07-27', count: 0 })).toEqual([]);
  });

  it('zählt bei einem anderen Wochentag genauso in Siebenerschritten', () => {
    expect(reihe({ from: '2026-07-27', weekday: THURSDAY, count: 3 })).toEqual([
      '2026-07-30',
      '2026-08-06',
      '2026-08-13',
    ]);
  });

  it('hält bei zwei Wochen den Abstand ein', () => {
    expect(reihe({ from: '2026-07-27', everyWeeks: 2 })).toEqual([
      '2026-07-28',
      '2026-08-11',
      '2026-08-25',
      '2026-09-08',
    ]);
  });

  it('setzt die Reihe am Anker fort statt bei heute', () => {
    // Der letzte erzeugte Abend war der 28. Juli; heute ist der 30.
    expect(
      reihe({ from: '2026-07-30', everyWeeks: 2, anchor: '2026-07-28' }),
    ).toEqual(['2026-08-11', '2026-08-25', '2026-09-08', '2026-09-22']);
  });

  it('liefert an zwei verschiedenen Tagen dieselbe Reihe', () => {
    // Der eigentliche Grund für den Anker: Ohne ihn nähme der Lauf am Mittwoch
    // den Dienstag darauf und der Lauf eine Woche später den Dienstag danach —
    // zwei um sieben Tage versetzte Reihen, und am Ende stünde wieder jede
    // Woche ein Termin.
    const mittwoch = reihe({
      from: '2026-07-29',
      everyWeeks: 2,
      anchor: '2026-07-28',
    });
    const dienstagDrauf = reihe({
      from: '2026-08-04',
      everyWeeks: 2,
      anchor: '2026-07-28',
    });

    expect(mittwoch).toEqual(dienstagDrauf);
  });

  it('verwirft einen Anker, der nicht auf dem eingestellten Wochentag liegt', () => {
    // Jemand hat von Dienstag auf Donnerstag umgestellt: Der alte Takt zählt
    // nicht mehr, die Reihe fängt beim nächsten Donnerstag an.
    expect(
      reihe({
        from: '2026-07-27',
        weekday: THURSDAY,
        count: 3,
        anchor: '2026-07-28',
      }),
    ).toEqual(['2026-07-30', '2026-08-06', '2026-08-13']);
  });

  it('beginnt bei heute, auch wenn der Anker weit vorne liegt', () => {
    // Der Normalfall im Betrieb: Der späteste erzeugte Abend ist der siebte
    // im Voraus. Die Reihe darf dort nicht anfangen — sonst legt jeder Lauf
    // sechs Termine dahinter an.
    expect(
      reihe({ from: '2026-07-27', count: 7, anchor: '2026-09-08' }),
    ).toEqual(reihe({ from: '2026-07-27', count: 7 }));
  });

  it('hält bei einem Anker vorne auch den Takt von vierzehn Tagen', () => {
    expect(
      reihe({
        from: '2026-07-27',
        count: 3,
        everyWeeks: 2,
        // Zwölf Wochen nach dem 28. Juli — also derselbe Takt.
        anchor: '2026-10-20',
      }),
    ).toEqual(['2026-07-28', '2026-08-11', '2026-08-25']);
    // Und eine Woche verschoben die andere Hälfte der Wochen.
    expect(
      reihe({
        from: '2026-07-27',
        count: 3,
        everyWeeks: 2,
        anchor: '2026-10-27',
      }),
    ).toEqual(['2026-08-04', '2026-08-18', '2026-09-01']);
  });

  it('überspringt einen Anker, der lange zurückliegt', () => {
    expect(
      reihe({
        from: '2026-07-27',
        count: 2,
        everyWeeks: 2,
        anchor: '2026-05-05',
      }),
    ).toEqual(['2026-07-28', '2026-08-11']);
  });
});

describe('isLastOfMonth', () => {
  it('is true for the final Tuesday of a month', () => {
    // July 2026 has Tuesdays on the 7th, 14th, 21st and 28th.
    expect(isLastOfMonth(utc('2026-07-28'))).toBe(true);
  });

  it('is false for earlier Tuesdays', () => {
    expect(isLastOfMonth(utc('2026-07-21'))).toBe(false);
    expect(isLastOfMonth(utc('2026-07-07'))).toBe(false);
  });

  it('handles a 5-Tuesday month', () => {
    // December 2026: 1st, 8th, 15th, 22nd, 29th.
    expect(isLastOfMonth(utc('2026-12-22'))).toBe(false);
    expect(isLastOfMonth(utc('2026-12-29'))).toBe(true);
  });

  it('handles February in a leap year', () => {
    // February 2028: 1st, 8th, 15th, 22nd, 29th.
    expect(isLastOfMonth(utc('2028-02-29'))).toBe(true);
    expect(isLastOfMonth(utc('2028-02-22'))).toBe(false);
  });

  it('gilt für jeden Wochentag — die Lobpreis-Regel trägt mit', () => {
    // Donnerstage im Juli 2026: 2., 9., 16., 23., 30.
    expect(isLastOfMonth(utc('2026-07-30'))).toBe(true);
    expect(isLastOfMonth(utc('2026-07-23'))).toBe(false);
  });

  it('rechnet mit dem eingestellten Abstand', () => {
    // Alle zwei Wochen, Dienstage: 14. und 28. Juli. Der 14. ist damit nicht
    // der letzte im Monat — mit der festen Sieben hätte die Regel ihn für den
    // vorletzten gehalten und trotzdem richtig gelegen; der 21. zeigt den
    // Unterschied: er ist gar kein Termin, aber die Sieben sagte „nein" und
    // die Vierzehn sagt „ja".
    expect(isLastOfMonth(utc('2026-07-14'), 2)).toBe(false);
    expect(isLastOfMonth(utc('2026-07-28'), 2)).toBe(true);
    expect(isLastOfMonth(utc('2026-07-21'), 2)).toBe(true);
  });
});

describe('toUtcDate / addDays', () => {
  it('drops the time part', () => {
    expect(toUtcDate(new Date('2026-07-27T18:30:00.000Z')).toISOString()).toBe(
      '2026-07-27T00:00:00.000Z',
    );
  });

  it('rolls over month and year boundaries', () => {
    expect(iso(addDays(utc('2026-12-31'), 1))).toBe('2027-01-01');
    expect(iso(addDays(utc('2026-03-01'), -1))).toBe('2026-02-28');
  });
});

/**
 * Der Fehler, der das hier ausgelöst hat: „heute" wurde aus den **UTC**-Feldern
 * eines Zeitpunkts gelesen. Zwischen Mitternacht und zwei Uhr Ortszeit war das
 * noch gestern — und der Termin von gestern stand deshalb unter „Kommende",
 * während die App ihn schon als „Vorbei" auswies.
 */
describe('currentDay', () => {
  it('ist nach Mitternacht schon der neue Tag (Sommerzeit)', () => {
    // 00:30 in Berlin, 22:30 UTC am Vortag.
    expect(iso(currentDay(BERLIN, new Date('2026-08-11T22:30:00.000Z')))).toBe(
      '2026-08-12',
    );
  });

  it('genauso in der Winterzeit, wo der Versatz eine Stunde ist', () => {
    expect(iso(currentDay(BERLIN, new Date('2026-01-11T23:30:00.000Z')))).toBe(
      '2026-01-12',
    );
  });

  it('kurz vor Mitternacht noch der alte', () => {
    // 23:59 Ortszeit.
    expect(iso(currentDay(BERLIN, new Date('2026-08-11T21:59:00.000Z')))).toBe(
      '2026-08-11',
    );
  });

  it('folgt der Zone, die hereingereicht wird', () => {
    // Derselbe Zeitpunkt, drei Uhren: in Auckland ist längst der 12., in
    // Berlin noch der 11., und in Honolulu erst der 10.
    const moment = new Date('2026-08-11T21:00:00.000Z');

    expect(iso(currentDay('Pacific/Auckland', moment))).toBe('2026-08-12');
    expect(iso(currentDay(BERLIN, moment))).toBe('2026-08-11');
    expect(iso(currentDay('Pacific/Honolulu', moment))).toBe('2026-08-11');
  });
});

describe('isPast', () => {
  const abend = utc('2026-08-11');

  it('am Abend selbst nicht — ein Termin gilt seinen ganzen Tag als kommend', () => {
    expect(isPast(abend, BERLIN, new Date('2026-08-11T20:00:00.000Z'))).toBe(
      false,
    );
  });

  it('um halb eins in der Nacht danach schon', () => {
    expect(isPast(abend, BERLIN, new Date('2026-08-11T22:30:00.000Z'))).toBe(
      true,
    );
  });
});

/**
 * „Vorbei" heißt den **ganzen** Zeitraum — dieselbe Aussage, die
 * `finishedBefore` in den Listen-Abfragen längst macht. Die punktuellen
 * Vergleiche lasen dagegen nur den Anfangstag und erklärten den zweiten Tag
 * einer laufenden Freizeit zur Vergangenheit.
 */
describe('spanIsPast', () => {
  const freizeit = {
    date: new Date('2026-08-14T00:00:00.000Z'),
    endDate: new Date('2026-08-16T00:00:00.000Z'),
  };

  it('zählt einen mehrtägigen Termin bis zu seinem letzten Tag', () => {
    // Samstag, mittendrin.
    expect(
      spanIsPast(freizeit, BERLIN, new Date('2026-08-15T10:00:00.000Z')),
    ).toBe(false);
    // Sonntag ist der letzte Tag und zählt noch dazu.
    expect(
      spanIsPast(freizeit, BERLIN, new Date('2026-08-16T18:00:00.000Z')),
    ).toBe(false);
    // Montag.
    expect(
      spanIsPast(freizeit, BERLIN, new Date('2026-08-17T10:00:00.000Z')),
    ).toBe(true);
  });

  it('verhält sich bei einem eintägigen wie isPast', () => {
    const abend = { date: new Date('2026-08-11T00:00:00.000Z') };
    const jetzt = new Date('2026-08-11T20:00:00.000Z');

    expect(spanIsPast(abend, BERLIN, jetzt)).toBe(
      isPast(abend.date, BERLIN, jetzt),
    );
  });

  /** `endDate: null` ist die Schreibweise aus der Datenbank, nicht „fehlt". */
  it('nimmt ein ausdrückliches null wie einen eintägigen Termin', () => {
    expect(
      spanIsPast(
        { date: new Date('2026-08-11T00:00:00.000Z'), endDate: null },
        BERLIN,
        new Date('2026-08-12T10:00:00.000Z'),
      ),
    ).toBe(true);
  });
});
