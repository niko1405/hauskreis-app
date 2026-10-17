/**
 * Ein Akkord als Zeichenkette — erkennen, zerlegen, transponieren.
 *
 * Reine Textarbeit ohne React und ohne `@/`-Importe, wie der Rest dieses
 * Ordners: Hier wird entschieden, ob „Am" ein Akkord ist und „Am I" eine
 * Textzeile, und das soll sich ohne die App prüfen lassen.
 *
 * **Zwei Schreibweisen.** Im Deutschen heißt der Ton, den der Rest der Welt B
 * nennt, H — und B heißt dort Bb. Lobpreis aus Deutschland kommt oft so daher
 * (Outbreakband, Feiert Jesus). Ein Blatt mit einem H darin gilt deshalb als
 * deutsch, und beim Transponieren wird in derselben Schreibweise
 * zurückgeschrieben. Die Moll-Namen auf „-es" (Es, As, Des) kennt die Erkennung
 * bewusst nicht: „Es" ist eines der häufigsten Wörter am Zeilenanfang.
 */

export type Notation = 'en' | 'de';

/** Ein zerlegter Akkord: Grundton und Bass als Halbtonzahl, dazwischen der Rest. */
export interface ParsedChord {
  root: number;
  /** Alles zwischen Grundton und Bass, unverändert: `m7`, `sus4`, `add9`. */
  suffix: string;
  bass: number | null;
}

const SHARPS = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const NATURAL: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
  H: 11,
};

/**
 * Was hinter dem Grundton stehen darf.
 *
 * Eine Liste von Bausteinen statt „beliebige Buchstaben": Sonst wären „Be",
 * „Da" und „Gott" Akkorde. Mit dieser Liste ist „Am" einer, „Amen" nicht — das
 * `e` kommt in keinem Baustein vor.
 */
const SUFFIX =
  /^(?:maj|min|mi|dim|aug|sus|add|no|m|M|[0-9]|#|b|♯|♭|\+|-|°|ø|Δ|\(|\)|,)*$/;

const NOTE = /^([A-H])([#b♯♭]?)/;

function accidental(sign: string): number {
  if (sign === '#' || sign === '♯') return 1;
  if (sign === 'b' || sign === '♭') return -1;
  return 0;
}

function noteValue(letter: string, sign: string, notation: Notation): number {
  // Deutsch: B ist Bb, H ist B. Englisch kennt kein H, liest es aber
  // gutmütig als B — ein einzelnes H macht das Blatt ohnehin deutsch.
  const base =
    notation === 'de' && letter === 'B' ? 10 : (NATURAL[letter] ?? 0);
  return (base + accidental(sign) + 12) % 12;
}

/** Zerlegt einen Akkord — oder sagt, dass es keiner ist. */
export function parseChord(
  symbol: string,
  notation: Notation = 'en',
): ParsedChord | null {
  if (symbol.length === 0 || symbol.length > 16) return null;

  // Ein Bass hinter dem Schrägstrich — aber „C6/9" ist kein Bass, sondern ein
  // Teil der Bezeichnung.
  const slash = symbol.lastIndexOf('/');
  const hasBass = slash > 0 && NOTE.test(symbol.slice(slash + 1));
  const head = hasBass ? symbol.slice(0, slash) : symbol;
  const tail = hasBass ? symbol.slice(slash + 1) : '';

  const root = NOTE.exec(head);
  if (!root) return null;

  const suffix = head.slice(root[0].length);
  if (!SUFFIX.test(suffix.replace(/\/\d+/g, ''))) return null;

  let bass: number | null = null;
  if (hasBass) {
    const match = NOTE.exec(tail);
    if (!match || match[0].length !== tail.length) return null;
    bass = noteValue(match[1] ?? '', match[2] ?? '', notation);
  }

  return {
    root: noteValue(root[1] ?? '', root[2] ?? '', notation),
    suffix,
    bass,
  };
}

export function isChord(symbol: string): boolean {
  return parseChord(symbol, 'de') !== null;
}

/** Ob der Akkord Moll ist — `m`, `min`, `mi` oder `-`, aber nicht `maj`. */
export function isMinor(suffix: string): boolean {
  return /^(?:m(?!aj)|min|mi|-)/.test(suffix);
}

/** Der Name eines Tons in der gewünschten Schreibweise. */
export function spellNote(
  value: number,
  { flats, notation }: { flats: boolean; notation: Notation },
): string {
  const index = ((value % 12) + 12) % 12;

  if (notation === 'de') {
    if (index === 11) return 'H';
    if (index === 10) return flats ? 'B' : 'A#';
  }

  return (flats ? FLATS : SHARPS)[index] ?? 'C';
}

/**
 * Ob eine Tonart mit ♭ geschrieben wird.
 *
 * Die Kreuz-Tonarten sind die Regel; ♭ haben F, Bb, Eb, Ab, Db und ihre
 * parallelen Moll-Tonarten. Fis/Ges ist beides — dort bleibt es beim Kreuz.
 */
export function prefersFlats(root: number, minor: boolean): boolean {
  const major = minor ? (root + 3) % 12 : root;
  return [1, 3, 5, 8, 10].includes(major);
}

/**
 * Einen Akkord um `steps` Halbtöne verschieben.
 *
 * Bei null Schritten kommt er unverändert zurück — samt Schreibweise, die der
 * Mensch gewählt hat. Was sich nicht zerlegen lässt, auch: Ein Akkord, den die
 * App nicht versteht, ist besser falsch transponiert als verschwunden.
 */
export function transposeChord(
  symbol: string,
  steps: number,
  options: { flats: boolean; notation: Notation },
): string {
  if (steps % 12 === 0) return symbol;

  const chord = parseChord(symbol, options.notation);
  if (!chord) return symbol;

  const root = spellNote(chord.root + steps, options);
  const bass =
    chord.bass === null ? '' : `/${spellNote(chord.bass + steps, options)}`;

  return `${root}${chord.suffix}${bass}`;
}

/** Die Halbtonzahl und das Geschlecht einer Tonart wie `A`, `F#m`, `Bb`. */
export function parseKey(
  key: string,
  notation: Notation = 'en',
): { root: number; minor: boolean } | null {
  const chord = parseChord(key.trim(), notation);
  if (!chord) return null;
  return { root: chord.root, minor: isMinor(chord.suffix) };
}

export function formatKey(
  root: number,
  minor: boolean,
  notation: Notation,
): string {
  const name = spellNote(root, {
    flats: prefersFlats(root, minor),
    notation,
  });
  return minor ? `${name}m` : name;
}

/** Eine Tonart um `steps` Halbtöne verschoben, in ihrer eigenen Schreibweise. */
export function transposeKey(
  key: string,
  steps: number,
  notation: Notation,
): string {
  const parsed = parseKey(key, notation);
  if (!parsed) return key;
  return formatKey(parsed.root + steps, parsed.minor, notation);
}
