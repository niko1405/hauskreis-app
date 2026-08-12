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
