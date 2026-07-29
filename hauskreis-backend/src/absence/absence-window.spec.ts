import { AbsenceCalendar, datesInRange } from './absence-window';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const holiday = {
  personId: 'niko',
  startDate: utc('2026-08-10'),
  endDate: utc('2026-08-24'),
};

describe('AbsenceCalendar.isAway', () => {
  it('covers both ends of the range', () => {
    const calendar = new AbsenceCalendar([holiday]);

    // "Weg bis zum 24." means the 24th is still away — an exclusive end would
    // quietly put somebody back a day early.
    expect(calendar.isAway('niko', utc('2026-08-10'))).toBe(true);
    expect(calendar.isAway('niko', utc('2026-08-24'))).toBe(true);
    expect(calendar.isAway('niko', utc('2026-08-09'))).toBe(false);
    expect(calendar.isAway('niko', utc('2026-08-25'))).toBe(false);
  });

  it('handles a single-day absence', () => {
    const calendar = new AbsenceCalendar([
      {
        personId: 'niko',
        startDate: utc('2026-08-10'),
        endDate: utc('2026-08-10'),
      },
    ]);

    expect(calendar.isAway('niko', utc('2026-08-10'))).toBe(true);
    expect(calendar.isAway('niko', utc('2026-08-11'))).toBe(false);
  });

  it('knows nothing about people with no periods', () => {
    const calendar = new AbsenceCalendar([holiday]);

    expect(calendar.isAway('chris', utc('2026-08-12'))).toBe(false);
  });

  it('unions overlapping periods', () => {
    const calendar = new AbsenceCalendar([
      holiday,
      {
        personId: 'niko',
        startDate: utc('2026-08-20'),
        endDate: utc('2026-08-30'),
      },
    ]);

    expect(calendar.isAway('niko', utc('2026-08-27'))).toBe(true);
    expect(calendar.isAway('niko', utc('2026-08-31'))).toBe(false);
  });

  it('ignores the time of day on the date being asked about', () => {
    const calendar = new AbsenceCalendar([holiday]);

    expect(calendar.isAway('niko', new Date('2026-08-24T22:30:00.000Z'))).toBe(
      true,
    );
  });
});

describe('AbsenceCalendar.areAllAway', () => {
  it('needs every resident of a shared home to be away', () => {
    const calendar = new AbsenceCalendar([holiday]);

    // Julian away, Marlene at home: the flat can still host.
    expect(calendar.areAllAway(['niko', 'marlene'], utc('2026-08-12'))).toBe(
      false,
    );
    expect(calendar.areAllAway(['niko'], utc('2026-08-12'))).toBe(true);
  });

  it('treats a home with no eligible residents as not away', () => {
    const calendar = new AbsenceCalendar([holiday]);

    expect(calendar.areAllAway([], utc('2026-08-12'))).toBe(false);
  });
});

describe('AbsenceCalendar.isAwayThroughout', () => {
  it('is true only when the whole span is covered', () => {
    const calendar = new AbsenceCalendar([holiday]);

    expect(
      calendar.isAwayThroughout('niko', utc('2026-08-11'), utc('2026-08-20')),
    ).toBe(true);
    // Half a fortnight away is no reason to leave somebody out of a rotation.
    expect(
      calendar.isAwayThroughout('niko', utc('2026-08-17'), utc('2026-08-30')),
    ).toBe(false);
  });

  it('stitches adjacent periods together', () => {
    const calendar = new AbsenceCalendar([
      {
        personId: 'niko',
        startDate: utc('2026-08-10'),
        endDate: utc('2026-08-15'),
      },
      {
        personId: 'niko',
        startDate: utc('2026-08-16'),
        endDate: utc('2026-08-24'),
      },
    ]);

    expect(
      calendar.isAwayThroughout('niko', utc('2026-08-10'), utc('2026-08-24')),
    ).toBe(true);
  });

  it('spots the gap between two periods', () => {
    const calendar = new AbsenceCalendar([
      {
        personId: 'niko',
        startDate: utc('2026-08-10'),
        endDate: utc('2026-08-14'),
      },
      {
        personId: 'niko',
        startDate: utc('2026-08-16'),
        endDate: utc('2026-08-24'),
      },
    ]);

    expect(
      calendar.isAwayThroughout('niko', utc('2026-08-10'), utc('2026-08-24')),
    ).toBe(false);
  });
});

describe('datesInRange', () => {
  it('includes both ends', () => {
    const dates = datesInRange(utc('2026-08-10'), utc('2026-08-13'));

    expect(dates.map((date) => date.toISOString().slice(0, 10))).toEqual([
      '2026-08-10',
      '2026-08-11',
      '2026-08-12',
      '2026-08-13',
    ]);
  });

  it('returns the single day for a one-day range', () => {
    expect(datesInRange(utc('2026-08-10'), utc('2026-08-10'))).toHaveLength(1);
  });

  it('returns nothing when the range runs backwards', () => {
    expect(datesInRange(utc('2026-08-13'), utc('2026-08-10'))).toEqual([]);
  });
});
