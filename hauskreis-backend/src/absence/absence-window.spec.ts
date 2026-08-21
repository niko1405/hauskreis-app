import { AbsenceCalendar } from './absence-window';

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

describe('AbsenceCalendar.exceptOn', () => {
  const calendar = new AbsenceCalendar([holiday]).exceptOn(
    utc('2026-08-11'),
    new Set(['niko']),
  );

  it('lässt die Zusage den Zeitraum stechen', () => {
    expect(calendar.isAway('niko', utc('2026-08-11'))).toBe(false);
  });

  /**
   * Nur an diesem einen Abend: Die Rangfolge spielt die ganze Historie durch
   * und fragt für jeden vergangenen Abend, wer damals weg war. Eine Zusage von
   * heute sagt darüber nichts.
   */
  it('gilt für keinen anderen Tag desselben Urlaubs', () => {
    expect(calendar.isAway('niko', utc('2026-08-12'))).toBe(true);
    expect(calendar.isAway('niko', utc('2026-08-24'))).toBe(true);
  });

  it('zieht die Wohnung mit, wenn alle Bewohner:innen zugesagt haben', () => {
    expect(calendar.areAllAway(['niko'], utc('2026-08-11'))).toBe(false);
    expect(calendar.areAllAway(['niko'], utc('2026-08-12'))).toBe(true);
  });

  it('gibt ohne Zusagen denselben Kalender zurück', () => {
    const base = new AbsenceCalendar([holiday]);

    expect(base.exceptOn(utc('2026-08-11'), new Set())).toBe(base);
  });
});
