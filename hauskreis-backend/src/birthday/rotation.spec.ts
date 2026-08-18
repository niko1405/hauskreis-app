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

/**
 * Was an einer Zuteilung nicht stimmt — eine leere Liste heißt: runde Sache.
 *
 * Geprüft wird die Zusage, auf die sich neun Leute verlassen: **jede:r
 * beschenkt genau einen und wird von genau einem beschenkt.** Einmal im Jahr
 * dran, nie für sich selbst.
 *
 * Als Aufzählung und nicht als Reihe von `expect`-Aufrufen, damit ein
 * Fehlschlag sagt, *wer* zu viel oder zu wenig hat — sonst stünde in der
 * Ausgabe nur, dass zwei sortierte Listen sich unterscheiden.
 */
function maengel(
  duties: ReadonlyMap<string, string>,
  members: readonly string[],
): string[] {
  const found: string[] = [];
  const responsibles = [...duties.values()];

  for (const id of members) {
    const besorgt = responsibles.filter((other) => other === id).length;
    if (besorgt !== 1) found.push(`${id} besorgt ${besorgt} Geschenke`);
    if (!duties.has(id)) found.push(`für ${id} ist niemand zuständig`);
  }

  for (const [forWhom, responsible] of duties) {
    if (forWhom === responsible) found.push(`${forWhom} beschenkt sich selbst`);
    if (!members.includes(responsible)) {
      found.push(`${responsible} ist gar nicht dabei`);
    }
  }

  return found.toSorted();
}

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
    expect(maengel(duties, ['a', 'b'])).toEqual([]);
  });

  /**
   * **Der Fehler, um den es ging.** Ein Neuzugang reißt zwei Löcher: Für ihn
   * ist niemand zuständig, und er selbst ist es für niemanden. Die alte
   * Fassung sah nur das erste, gab ihm jemanden aus dem Bestand — und der
   * hatte danach zwei, während der Neue nichts zu tun bekam. In der Verwaltung
   * stand dann genau das: einer ohne Zuteilung, einer mit zwei.
   */
  it('teilt einen Neuzugang auch selbst ein', () => {
    const kreis = new Map([
      ['a', 'c'],
      ['b', 'a'],
      ['c', 'b'],
    ]);

    const { duties, changed } = repairPairings(kreis, ['a', 'b', 'c', 'd']);

    expect(changed).toBe(true);
    expect(maengel(duties, ['a', 'b', 'c', 'd'])).toEqual([]);
    // Eingehängt statt neu gewürfelt: drei der vier alten Kanten bleiben.
    expect(duties.get('b')).toBe('a');
    expect(duties.get('c')).toBe('b');
    expect(duties.get('a')).toBe('d');
    expect(duties.get('d')).toBe('c');
  });

  /**
   * Und derselbe Weg noch einmal, so wie er in der App entsteht: Man lädt
   * jemanden ein, dann noch jemanden — der Planer läuft nach jedem Zugang.
   * Beim zweiten Mal war die Zuteilung schon schief, und die alte Fassung
   * schrieb die Schieflage fort.
   */
  it('bleibt rund, wenn nacheinander zwei dazukommen', () => {
    const kreis = new Map([
      ['a', 'c'],
      ['b', 'a'],
      ['c', 'b'],
    ]);

    const nachD = repairPairings(kreis, ['a', 'b', 'c', 'd']).duties;
    expect(maengel(nachD, ['a', 'b', 'c', 'd'])).toEqual([]);

    const nachE = repairPairings(nachD, ['a', 'b', 'c', 'd', 'e']).duties;
    expect(maengel(nachE, ['a', 'b', 'c', 'd', 'e'])).toEqual([]);
  });

  it('nimmt zwei Neuzugänge auf einmal auf', () => {
    const fest = new Map([
      ['a', 'b'],
      ['b', 'a'],
    ]);

    const { duties } = repairPairings(fest, ['a', 'b', 'c', 'd']);

    expect(maengel(duties, ['a', 'b', 'c', 'd'])).toEqual([]);
    // Das bestehende Paar bleibt, wie es war.
    expect(duties.get('a')).toBe('b');
    expect(duties.get('b')).toBe('a');
  });

  /**
   * Eine doppelte Zuständigkeit kann nur aus alten Daten kommen — die
   * Verwaltung lässt sie nicht mehr zu. Sie wird auf eine Kante zurückgeführt,
   * und zwar auf dieselbe bei jedem Lauf.
   */
  it('löst eine doppelte Zuständigkeit auf', () => {
    const fest = new Map([
      ['b', 'a'],
      ['c', 'a'],
    ]);

    const { duties } = repairPairings(fest, ['a', 'b', 'c', 'd']);

    expect(maengel(duties, ['a', 'b', 'c', 'd'])).toEqual([]);
    // Die erste Kante nach Geburtstagsperson gewinnt.
    expect(duties.get('b')).toBe('a');
  });

  it('wirft eine Zuteilung auf sich selbst weg', () => {
    const { duties } = repairPairings(new Map([['a', 'a']]), ['a', 'b']);
    expect(duties.get('a')).toBe('b');
    expect(maengel(duties, ['a', 'b'])).toEqual([]);
  });

  it('lässt eine einzelne Person ohne Zuständigen', () => {
    const { duties } = repairPairings(new Map(), ['a']);
    expect(duties.size).toBe(0);
  });

  it('macht aus dem Nichts eine vollständige Runde', () => {
    const mitglieder = ['a', 'b', 'c', 'd', 'e'];
    expect(
      maengel(repairPairings(new Map(), mitglieder).duties, mitglieder),
    ).toEqual([]);
  });

  it('ist deterministisch', () => {
    const mitglieder = ['a', 'b', 'c', 'd', 'e'];
    const erste = repairPairings(new Map(), mitglieder).duties;
    const zweite = repairPairings(new Map(), mitglieder.toReversed()).duties;
    expect([...erste].toSorted()).toEqual([...zweite].toSorted());
  });
});
