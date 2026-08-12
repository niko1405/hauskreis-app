import {
  addDays,
  currentDay,
  isLastOfMonth,
  isPast,
  nextWeekdayAfter,
  toUtcDate,
  upcomingWeekdays,
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

describe('upcomingWeekdays', () => {
  it('returns consecutive Tuesdays', () => {
    expect(upcomingWeekdays(utc('2026-07-27'), TUESDAY, 4).map(iso)).toEqual([
      '2026-07-28',
      '2026-08-04',
      '2026-08-11',
      '2026-08-18',
    ]);
  });

  it('returns nothing when asked for nothing', () => {
    expect(upcomingWeekdays(utc('2026-07-27'), TUESDAY, 0)).toEqual([]);
  });

  it('zählt bei einem anderen Wochentag genauso in Siebenerschritten', () => {
    expect(upcomingWeekdays(utc('2026-07-27'), THURSDAY, 3).map(iso)).toEqual([
      '2026-07-30',
      '2026-08-06',
      '2026-08-13',
    ]);
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
