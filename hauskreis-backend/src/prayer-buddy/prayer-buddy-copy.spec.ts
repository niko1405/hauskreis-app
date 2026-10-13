import { circleFor, isHalftime } from './prayer-buddy-copy';

const on = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('isHalftime', () => {
  // Zwei Wochen, Dienstag bis Montag — die Vorgabe.
  const start = '2026-10-06';
  const end = '2026-10-19';

  it('is halftime on the day after the first week', () => {
    expect(isHalftime(start, end, on('2026-10-13'))).toBe(true);
  });

  it('is not halftime before', () => {
    expect(isHalftime(start, end, on('2026-10-12'))).toBe(false);
  });

  it('still catches up two days late, but not three', () => {
    expect(isHalftime(start, end, on('2026-10-15'))).toBe(true);
    expect(isHalftime(start, end, on('2026-10-16'))).toBe(false);
  });

  it('finds the middle of a one-week round', () => {
    // Sieben Tage, Dienstag bis Montag: Halbzeit ist der Freitag.
    expect(isHalftime('2026-10-06', '2026-10-12', on('2026-10-08'))).toBe(
      false,
    );
    expect(isHalftime('2026-10-06', '2026-10-12', on('2026-10-09'))).toBe(true);
  });

  it('never fires on the last day', () => {
    // Drei Tage: Halbzeit am zweiten, das Nachholfenster reichte bis zum
    // letzten — dort wird nicht mehr erinnert.
    expect(isHalftime('2026-10-06', '2026-10-08', on('2026-10-07'))).toBe(true);
    expect(isHalftime('2026-10-06', '2026-10-08', on('2026-10-08'))).toBe(
      false,
    );
  });

  it('ignores rounds too short to have a middle', () => {
    expect(isHalftime('2026-10-06', '2026-10-07', on('2026-10-06'))).toBe(
      false,
    );
  });
});

describe('circleFor', () => {
  const anna = { name: 'Anna' };
  const ben = { name: 'Ben' };
  const cleo = { name: 'Cleo' };

  it('says "mit" for a pair', () => {
    expect(circleFor([anna, ben], 0)).toBe('betest du mit Ben');
  });

  it('spells out the direction for a trio', () => {
    expect(circleFor([anna, ben, cleo], 0)).toBe(
      'betest du für Ben — Cleo betet für dich',
    );
  });
});
