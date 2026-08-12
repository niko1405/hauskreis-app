import { wallClockIn, wallClockOut } from './wall-clock';

describe('wallClockIn', () => {
  it('rechnet eine Uhrzeit in Minuten um', () => {
    expect(wallClockIn.parse('19:30')).toBe(1170);
    expect(wallClockIn.parse('00:00')).toBe(0);
    expect(wallClockIn.parse('23:59')).toBe(1439);
  });

  // Die Grenzen sind der Grund für das Muster statt eines schlichten `string`:
  // ein `24:00` wäre der nächste Tag, und `18:00:00` eine zweite Schreibweise
  // für dieselbe Zeit.
  it.each(['24:00', '23:60', '9:30', '18:00:00', '', 'abends'])(
    'lehnt %p ab',
    (eingabe) => {
      expect(wallClockIn.safeParse(eingabe).success).toBe(false);
    },
  );
});

describe('wallClockOut', () => {
  it('macht aus Minuten wieder eine Uhrzeit', () => {
    expect(wallClockOut.parse(1170)).toBe('19:30');
    expect(wallClockOut.parse(0)).toBe('00:00');
    expect(wallClockOut.parse(1439)).toBe('23:59');
  });

  it('füllt die Stunde auf zwei Stellen auf', () => {
    // Sonst stünde „9:05" da und ließe sich nicht mit „10:00" vergleichen.
    expect(wallClockOut.parse(9 * 60 + 5)).toBe('09:05');
  });

  it('lehnt ab, was kein Tag mehr ist', () => {
    expect(wallClockOut.safeParse(1440).success).toBe(false);
    expect(wallClockOut.safeParse(-1).success).toBe(false);
    expect(wallClockOut.safeParse(90.5).success).toBe(false);
  });

  it('ist die Umkehrung von wallClockIn', () => {
    for (const zeit of ['00:00', '07:15', '18:00', '19:30', '23:59']) {
      expect(wallClockOut.parse(wallClockIn.parse(zeit))).toBe(zeit);
    }
  });
});
