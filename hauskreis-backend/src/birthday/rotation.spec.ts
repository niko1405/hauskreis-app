import {
  ageAt,
  birthdayInYear,
  compareInYear,
  daysUntil,
  nextBirthday,
} from './birthday-dates';
import { repairPairings, rotate, type GiftablePerson } from './rotation';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const person = (id: string, birthdate: string): GiftablePerson => ({
  id,
  name: id.toUpperCase(),
  birthdate: day(birthdate),
});

describe('birthday-dates', () => {
  it('nimmt den Geburtstag in diesem Jahr, solange er nicht vorbei ist', () => {
    expect(nextBirthday(day('1990-08-20'), day('2026-08-18'))).toEqual(
      day('2026-08-20'),
    );
  });

  it('zählt den heutigen Geburtstag noch als kommend', () => {
    // Der ganze Tag über soll die Karte oben stehen — nicht bis Mitternacht.
    expect(nextBirthday(day('1990-08-18'), day('2026-08-18'))).toEqual(
      day('2026-08-18'),
    );
  });

  it('rückt ins nächste Jahr, sobald der Tag vorbei ist', () => {
    expect(nextBirthday(day('1990-08-17'), day('2026-08-18'))).toEqual(
      day('2027-08-17'),
    );
  });

  it('feiert den 29. Februar in normalen Jahren am 28.', () => {
    // Ohne Sonderregel würde JavaScript daraus stillschweigend den 1. März
    // machen — ein Fehler, den man erst Jahre später sähe.
    expect(birthdayInYear(day('1992-02-29'), 2027)).toEqual(day('2027-02-28'));
    expect(birthdayInYear(day('1992-02-29'), 2028)).toEqual(day('2028-02-29'));
  });

  it('zählt Tage bis zum Geburtstag, auch über den Jahreswechsel', () => {
    expect(daysUntil(day('2027-01-01'), day('2026-12-30'))).toBe(2);
    expect(daysUntil(day('2026-08-17'), day('2026-08-18'))).toBe(-1);
  });

  it('verschweigt ein Alter, das nicht gemeint sein kann', () => {
    expect(ageAt(day('1990-08-20'), day('2026-08-20'))).toBe(36);
    expect(ageAt(day('1900-08-20'), day('2026-08-20'))).toBeNull();
  });

  it('ordnet nach Monat und Tag, ohne das Jahr', () => {
    expect(compareInYear(day('2001-03-04'), day('1980-11-02'))).toBeLessThan(0);
    expect(compareInYear(day('2001-03-04'), day('1980-03-01'))).toBeGreaterThan(
      0,
    );
  });
});

describe('rotate', () => {
  const leute = [
    person('a', '1990-01-10'),
    person('b', '1991-04-02'),
    person('c', '1992-09-30'),
  ];

  it('macht jede:n für den zuständig, der als nächstes dran ist', () => {
    const duties = rotate(leute);

    // Reihenfolge im Jahr: a (Jan) → b (Apr) → c (Sep) → a
    expect(duties.get('b')).toBe('a');
    expect(duties.get('c')).toBe('b');
    expect(duties.get('a')).toBe('c');
  });

  it('teilt in einer Runde jede:n genau einmal ein', () => {
    const duties = rotate(leute);
    expect(new Set(duties.values()).size).toBe(leute.length);
  });

  it('lässt niemanden für sich selbst zuständig sein', () => {
    const duties = rotate(leute);
    for (const [forWhom, responsible] of duties) {
      expect(responsible).not.toBe(forWhom);
    }
  });

  it('hängt nicht am Jahr des Geburtsdatums', () => {
    // Dieselben Tage, andere Jahrgänge — der Kreis muss derselbe sein.
    const andere = [
      person('a', '2005-01-10'),
      person('b', '1960-04-02'),
      person('c', '1978-09-30'),
    ];
    expect([...rotate(andere)]).toEqual([...rotate(leute)]);
  });

  it('bleibt bei gleichem Tag deterministisch', () => {
    const zwillinge = [
      person('b', '1990-05-05'),
      person('a', '1991-05-05'),
      person('c', '1992-12-01'),
    ];
    expect([...rotate(zwillinge)]).toEqual([...rotate(zwillinge.toReversed())]);
  });

  it('teilt bei weniger als zwei Personen niemanden ein', () => {
    expect(rotate([person('a', '1990-01-10')]).size).toBe(0);
    expect(rotate([]).size).toBe(0);
  });
});

describe('repairPairings', () => {
  it('lässt eine tragfähige Zuteilung unangetastet', () => {
    const fest = new Map([
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'],
    ]);

    const { duties, changed } = repairPairings(fest, ['a', 'b', 'c']);

    expect(changed).toBe(false);
    expect([...duties]).toEqual([...fest]);
  });

  it('rückt jemanden nach, wenn der Zuständige weg ist', () => {
    // `c` ist ausgetreten — für `b` war er zuständig, und da steht jetzt ein
    // Loch. Es wird gestopft, nicht liegengelassen.
    const fest = new Map([
      ['a', 'b'],
      ['b', 'c'],
    ]);

    const { duties, changed } = repairPairings(fest, ['a', 'b']);

    expect(changed).toBe(true);
    expect(duties.get('a')).toBe('b');
    expect(duties.get('b')).toBe('a');
  });

  it('nimmt ein neues Mitglied in beide Richtungen auf', () => {
    const fest = new Map([
      ['a', 'b'],
      ['b', 'a'],
    ]);

    const { duties, changed } = repairPairings(fest, ['a', 'b', 'c']);

    expect(changed).toBe(true);
    // `c` bekommt jemanden — und zwar den mit der geringsten Last.
    expect(duties.get('c')).toBeDefined();
    expect(duties.get('c')).not.toBe('c');
  });

  it('verteilt die Löcher auf die, die am wenigsten zu tun haben', () => {
    // `a` ist schon für zwei zuständig. Die beiden offenen Plätze gehen an
    // Leute mit weniger Last — `a` bekommt nichts dazu.
    const fest = new Map([
      ['b', 'a'],
      ['c', 'a'],
    ]);

    const { duties } = repairPairings(fest, ['a', 'b', 'c', 'd']);

    const last = (id: string) =>
      [...duties.values()].filter((responsible) => responsible === id).length;

    expect(last('a')).toBe(2);
    expect(duties.size).toBe(4);
    for (const id of ['b', 'c', 'd']) expect(last(id)).toBeLessThanOrEqual(1);
  });

  it('wirft eine Zuteilung auf sich selbst weg', () => {
    const { duties } = repairPairings(new Map([['a', 'a']]), ['a', 'b']);
    expect(duties.get('a')).toBe('b');
  });

  it('lässt eine einzelne Person ohne Zuständigen', () => {
    const { duties } = repairPairings(new Map(), ['a']);
    expect(duties.size).toBe(0);
  });

  it('ist deterministisch', () => {
    const mitglieder = ['a', 'b', 'c', 'd', 'e'];
    const erste = repairPairings(new Map(), mitglieder).duties;
    const zweite = repairPairings(new Map(), mitglieder.toReversed()).duties;
    expect([...erste].toSorted()).toEqual([...zweite].toSorted());
  });
});
