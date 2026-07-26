import {
  addDays,
  isLastTuesdayOfMonth,
  nextTuesdayAfter,
  toUtcDate,
  upcomingTuesdays,
} from './meeting-schedule';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

describe('nextTuesdayAfter', () => {
  it('returns the coming Tuesday from a mid-week day', () => {
    // 2026-07-27 is a Monday.
    expect(iso(nextTuesdayAfter(utc('2026-07-27')))).toBe('2026-07-28');
  });

  it('skips to the following week when given a Tuesday', () => {
    expect(iso(nextTuesdayAfter(utc('2026-07-28')))).toBe('2026-08-04');
  });

  it('crosses a month boundary', () => {
    expect(iso(nextTuesdayAfter(utc('2026-07-29')))).toBe('2026-08-04');
  });

  it('ignores the time of day', () => {
    expect(iso(nextTuesdayAfter(new Date('2026-07-27T23:59:59.000Z')))).toBe(
      '2026-07-28',
    );
  });
});

describe('upcomingTuesdays', () => {
  it('returns consecutive Tuesdays', () => {
    expect(upcomingTuesdays(utc('2026-07-27'), 4).map(iso)).toEqual([
      '2026-07-28',
      '2026-08-04',
      '2026-08-11',
      '2026-08-18',
    ]);
  });

  it('returns nothing when asked for nothing', () => {
    expect(upcomingTuesdays(utc('2026-07-27'), 0)).toEqual([]);
  });
});

describe('isLastTuesdayOfMonth', () => {
  it('is true for the final Tuesday of a month', () => {
    // July 2026 has Tuesdays on the 7th, 14th, 21st and 28th.
    expect(isLastTuesdayOfMonth(utc('2026-07-28'))).toBe(true);
  });

  it('is false for earlier Tuesdays', () => {
    expect(isLastTuesdayOfMonth(utc('2026-07-21'))).toBe(false);
    expect(isLastTuesdayOfMonth(utc('2026-07-07'))).toBe(false);
  });

  it('handles a 5-Tuesday month', () => {
    // December 2026: 1st, 8th, 15th, 22nd, 29th.
    expect(isLastTuesdayOfMonth(utc('2026-12-22'))).toBe(false);
    expect(isLastTuesdayOfMonth(utc('2026-12-29'))).toBe(true);
  });

  it('handles February in a leap year', () => {
    // February 2028: 1st, 8th, 15th, 22nd, 29th.
    expect(isLastTuesdayOfMonth(utc('2028-02-29'))).toBe(true);
    expect(isLastTuesdayOfMonth(utc('2028-02-22'))).toBe(false);
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
