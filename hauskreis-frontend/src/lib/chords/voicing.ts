/**
 * Wie ein Akkord gegriffen wird — auf der Gitarre und auf dem Klavier.
 *
 * **Gerechnet, nicht nachgeschlagen.** Eine Tabelle mit Griffen kennt die
 * Akkorde, die jemand hineingeschrieben hat, und für „G/B" oder „Cadd9" meist
 * keinen. Hier werden die Töne eines Akkords aus seinem Namen gelesen
 * (`chordTones`), und die Griffe dazu sucht die App selbst auf dem Griffbrett:
 * jede Saite stumm, leer oder auf einem Bund, der einen Akkordton trifft. Was
 * spielbar ist und alle nötigen Töne hat, kommt in die Liste — sortiert nach
 * einer Wertung, die die Griffe vorn hält, die man aus dem Liederbuch kennt
 * (offene Saiten unten am Hals, wenig Finger, kein Barré ohne Not).
 *
 * Ohne React und ohne `@/`-Importe wie der Rest des Ordners, damit es sich für
 * sich prüfen lässt — gerade die Reihenfolge („C ist zuerst x32010").
 */
import { parseChord, type Notation } from './chord';

export interface ChordTones {
  /** Grundton als Halbtonzahl (C = 0). */
  root: number;
  /** Der Basston eines Slash-Akkords, sonst `null`. */
  bass: number | null;
  /** Intervalle über dem Grundton, die nicht fehlen dürfen. */
  required: number[];
  /** Intervalle, die man weglassen darf — meist die Quinte. */
  optional: number[];
}

/** Ein Ton, den der Akkord noch hinzunimmt — eine Option über der Septime. */
const ADDED: Record<string, number> = {
  '2': 2,
  '9': 2,
  '4': 5,
  '11': 5,
  '6': 9,
  '13': 9,
};

/** Alterierte Töne: `b9`, `#11` und Verwandte. */
const ALTERED: Record<string, number> = {
  b5: 6,
  '#5': 8,
  '+5': 8,
  b9: 1,
  '#9': 3,
  '#11': 6,
  b13: 8,
};

/**
 * Die Töne eines Akkords aus seiner Bezeichnung.
 *
 * Der Name wird in Bausteine zerlegt: erst das Geschlecht (`m`, `dim`, `ø`,
 * `aug`), dann Zahlen, `sus`, `add` und Alterationen. Was die App nicht
 * versteht, fällt auf den Dreiklang zurück — ein Griff für „C" ist für einen
 * unbekannten C-Akkord eine bessere Auskunft als keiner.
 */
export function chordTones(
  symbol: string,
  notation: Notation = 'en',
): ChordTones | null {
  const parsed = parseChord(symbol, notation);
  if (!parsed) return null;

  let rest = parsed.suffix
    .replace(/[(),]/g, '')
    .replace(/♯/g, '#')
    .replace(/♭/g, 'b')
    .replace(/Δ/g, 'maj');

  let third: number | null = 4;
  let fifth: number | null = 7;
  let fifthAltered = false;
  let seventh: number | null = null;
  let sixth = false;
  let majorSeventh = false;
  let thirdOptional = false;
  const added = new Set<number>();
  const optionalAdded = new Set<number>();

  // Das Geschlecht steht vorn — `maj` zuerst, sonst läse sich „maj7" als Moll.
  if (/^(?:maj|M)/.test(rest)) {
    majorSeventh = true;
    rest = rest.replace(/^(?:maj|M)/, '');
    // „Cmaj" ohne Zahl ist schlicht Dur.
    if (!/^\d/.test(rest)) majorSeventh = false;
  } else if (/^(?:min|mi|m|-)/.test(rest)) {
    third = 3;
    rest = rest.replace(/^(?:min|mi|m|-)/, '');
    if (/^(?:maj|M)/.test(rest)) {
      majorSeventh = true;
      rest = rest.replace(/^(?:maj|M)/, '');
    }
  } else if (/^(?:dim|°)/.test(rest)) {
    third = 3;
    fifth = 6;
    fifthAltered = true;
    rest = rest.replace(/^(?:dim|°)/, '');
    if (rest.startsWith('7')) {
      seventh = 9;
      rest = rest.slice(1);
    }
  } else if (rest.startsWith('ø')) {
    third = 3;
    fifth = 6;
    fifthAltered = true;
    seventh = 10;
    rest = rest.slice(1).replace(/^7/, '');
  } else if (/^(?:aug|\+)/.test(rest)) {
    fifth = 8;
    fifthAltered = true;
    rest = rest.replace(/^(?:aug|\+)/, '');
  }

  // Ein Powerchord ist Grundton und Quinte, sonst nichts.
  if (rest === '5') {
    return {
      root: parsed.root,
      bass: parsed.bass,
      required: [0, 7],
      optional: [],
    };
  }

  const tokens =
    rest.match(
      /sus[24]?|add(?:13|11|9|6|4|2)|no[35]|[#b+](?:13|11|9|5)|maj|aug|alt|13|11|9|7|6|4|2/g,
    ) ?? [];

  const withSeventh = () => {
    if (seventh === null && !sixth) seventh = majorSeventh ? 11 : 10;
  };

  for (const token of tokens) {
    if (token === 'maj') {
      majorSeventh = true;
    } else if (token === 'sus2') {
      third = 2;
    } else if (token === 'sus4' || token === 'sus' || token === '4') {
      third = 5;
    } else if (token.startsWith('add')) {
      const value = ADDED[token.slice(3)];
      if (value !== undefined) added.add(value);
    } else if (token === 'no3') {
      third = null;
    } else if (token === 'no5') {
      fifth = null;
    } else if (token in ALTERED) {
      const value = ALTERED[token] ?? 0;
      if (token.endsWith('5')) {
        fifth = value;
        fifthAltered = true;
      } else {
        withSeventh();
        added.add(value);
      }
    } else if (token === 'aug') {
      fifth = 8;
      fifthAltered = true;
    } else if (token === 'alt') {
      withSeventh();
      added.add(1);
      added.add(3);
    } else if (token === '7') {
      seventh = majorSeventh ? 11 : seventh === 9 ? 9 : 10;
    } else if (token === '6') {
      sixth = true;
      added.add(9);
    } else if (token === '9') {
      // „6/9" ist eine Sexte mit None, ohne Septime.
      withSeventh();
      added.add(2);
    } else if (token === '11') {
      withSeventh();
      added.add(5);
      optionalAdded.add(2);
      // Im Elfer-Akkord fällt die Terz meist weg — sie reibt sich an der Elf.
      thirdOptional = true;
    } else if (token === '13') {
      withSeventh();
      added.add(9);
      optionalAdded.add(2);
    } else if (token === '2') {
      added.add(2);
    }
  }

  const required = new Set<number>([0]);
  const optional = new Set<number>();

  if (third !== null) (thirdOptional ? optional : required).add(third);
  if (fifth !== null) (fifthAltered ? required : optional).add(fifth);
  if (seventh !== null) required.add(seventh);
  for (const value of added) required.add(value);
  for (const value of optionalAdded) {
    if (!required.has(value)) optional.add(value);
  }

  return {
    root: parsed.root,
    bass: parsed.bass,
    required: [...required],
    optional: [...optional].filter((value) => !required.has(value)),
  };
}

// ------------------------------------------------------------- Gitarre

/** Standardstimmung, von der tiefen E-Saite aus: E A D G H E. */
const TUNING = [4, 9, 2, 7, 11, 4];
/** Dieselbe als Tonhöhe (MIDI) — für den Abstand der beiden tiefsten Töne. */
const PITCH = [40, 45, 50, 55, 59, 64];

/** Die Saiten, wie sie unter einem Griffbild stehen. */
export const GUITAR_STRINGS = ['E', 'A', 'D', 'G', 'B', 'E'];

export interface GuitarVoicing {
  /** Je Saite, tiefe E zuerst: `null` stumm, `0` leer, sonst der Bund. */
  frets: (number | null)[];
  /** Je Saite der Finger, `0` für keinen (leer oder stumm). */
  fingers: number[];
  /** Ein Barré: Zeigefinger flach über mehrere Saiten auf einem Bund. */
  barre: { fret: number; from: number; to: number } | null;
  /** Der oberste Bund des Bildes — 1 heißt: mit Sattel. */
  baseFret: number;
}

const WINDOW = 4;
const HIGHEST_START = 12;
/** Leere Saiten nur, solange die Hand noch unten am Hals ist. */
const OPEN_UNTIL = 4;

interface Candidate {
  voicing: GuitarVoicing;
  score: number;
}

/** Gegriffene Töne nach Bund, dann von der tiefen Saite aus. */
function ordered(entries: { fret: number; string: number }[]) {
  return entries.toSorted((a, b) => a.fret - b.fret || a.string - b.string);
}

/**
 * Die Finger und ob es ein Barré braucht — oder `null`, wenn der Griff mit
 * einer Hand nicht geht.
 */
function fingering(
  frets: (number | null)[],
): Pick<GuitarVoicing, 'fingers' | 'barre'> | null {
  const fretted = frets
    .map((fret, string) => ({ fret, string }))
    .filter(
      (entry): entry is { fret: number; string: number } =>
        entry.fret !== null && entry.fret > 0,
    );
  const fingers = frets.map(() => 0);

  if (fretted.length <= 4) {
    ordered(fretted).forEach((entry, index) => {
      fingers[entry.string] = index + 1;
    });
    return { fingers, barre: null };
  }

  // Mehr als vier gegriffene Töne gehen nur mit einem Barré auf dem tiefsten
  // Bund — und der liegt über allen Saiten dazwischen, keine darf leer oder
  // stumm sein.
  const lowest = Math.min(...fretted.map((entry) => entry.fret));
  const onLowest = fretted.filter((entry) => entry.fret === lowest);
  const from = Math.min(...onLowest.map((entry) => entry.string));
  const to = Math.max(...onLowest.map((entry) => entry.string));
  if (to === from) return null;

  for (let string = from; string <= to; string += 1) {
    const fret = frets[string];
    if (fret === null || fret === undefined || fret < lowest) return null;
  }

  const above = fretted.filter(
    (entry) => !(entry.fret === lowest && entry.string >= from),
  );
  if (above.length > 3) return null;

  for (let string = from; string <= to; string += 1) {
    if (frets[string] === lowest) fingers[string] = 1;
  }
  ordered(above).forEach((entry, index) => {
    fingers[entry.string] = index + 2;
  });

  return { fingers, barre: { fret: lowest, from, to } };
}

/**
 * Ob die stummen Saiten dort liegen, wo eine Hand sie stumm lässt: als Block
 * von unten (der Bass gehört dem Grundton) und höchstens die oberste — oder,
 * bei einem Powerchord, als Block von oben.
 */
function mutesPlayable(frets: (number | null)[], power: boolean): boolean {
  const first = frets.findIndex((fret) => fret !== null);
  if (first === -1) return false;
  const last = frets.findLastIndex((fret) => fret !== null);
  for (let string = first; string <= last; string += 1) {
    if (frets[string] === null) return false;
  }
  const mutedTop = frets.length - 1 - last;
  return power || mutedTop <= 1;
}

function evaluate(
  frets: (number | null)[],
  tones: ChordTones,
  allowed: Set<number>,
): Candidate | null {
  const power = tones.required.length === 2 && tones.optional.length === 0;
  if (!mutesPlayable(frets, power)) return null;

  const sounding = frets
    .map((fret, string) =>
      fret === null ? null : (TUNING[string]! + fret) % 12,
    )
    .filter((pitch): pitch is number => pitch !== null);
  if (sounding.length < (power ? 3 : 4)) return null;

  // Der tiefste Ton trägt den Akkord: der Grundton, oder der Bass dahinter.
  const bass = tones.bass ?? tones.root;
  if (sounding[0] !== bass) return null;

  const present = new Set(
    sounding.map((pitch) => (pitch - tones.root + 12) % 12),
  );
  for (const interval of tones.required) {
    if (!present.has(interval)) return null;
  }
  for (const interval of present) {
    if (!allowed.has(interval) && (interval + tones.root) % 12 !== bass) {
      return null;
    }
  }

  const hand = fingering(frets);
  if (!hand) return null;

  const fretted = frets.filter(
    (fret): fret is number => fret !== null && fret > 0,
  );
  const low = fretted.length > 0 ? Math.min(...fretted) : 0;
  const high = fretted.length > 0 ? Math.max(...fretted) : 0;
  const muted = frets.filter((fret) => fret === null).length;
  const open = frets.filter((fret) => fret === 0).length;

  // Leere Saiten klingen nur in der offenen Lage nach einem Griff, den man
  // kennt. Weiter oben am Hals entstehen damit Formen wie x20402 für Hm, die
  // gültig sind und die niemand spielt.
  if (open > 0 && high > 3) return null;
  // Und nicht, wenn der Bass im ersten Bund liegt: F, Bb und Eb spielt man
  // nicht in der offenen Lage, und Formen wie x10331 kennt niemand als Bb.
  const bassFret = frets.find((fret) => fret !== null);
  if (open > 0 && bassFret === 1) return null;

  // Zwei Töne im Abstand einer Sekunde ganz unten klingen nach Matsch — so
  // greift niemand Cadd9 (x30010 statt x32030).
  const heights = frets
    .map((fret, string) => (fret === null ? null : PITCH[string]! + fret))
    .filter((pitch): pitch is number => pitch !== null);
  const bottomGap = (heights[1] ?? 0) - (heights[0] ?? 0);
  const muddy = bottomGap > 0 && bottomGap < 3;
  const mutedTop = frets.at(-1) === null;
  const used = new Set(hand.fingers.filter((finger) => finger > 0)).size;
  const missing = tones.optional.filter(
    (interval) => !present.has(interval),
  ).length;

  const score =
    low * 0.8 +
    muted * 1.5 +
    (mutedTop ? 1 : 0) -
    open +
    (hand.barre ? 1.5 : 0) +
    used * 0.5 +
    (high - low) * 1.2 +
    missing * 2 +
    (muddy ? 2 : 0) -
    sounding.length * 0.5;

  return {
    voicing: {
      frets,
      ...hand,
      baseFret: high <= WINDOW ? 1 : low,
    },
    score,
  };
}

const guitarCache = new Map<string, GuitarVoicing[]>();

/**
 * Die Griffe für einen Akkord auf der Gitarre, der naheliegendste zuerst.
 *
 * Gesucht wird in Fenstern von vier Bünden, vom offenen Akkord bis zum
 * zwölften Bund: Jede Saite ist stumm, leer (nur unten am Hals) oder auf einem
 * Bund im Fenster, der einen Akkordton trifft. Gültig ist, was alle nötigen
 * Töne hat, den richtigen Ton im Bass, höchstens vier Finger braucht und die
 * stummen Saiten dort hat, wo eine Hand sie stumm lässt.
 */
export function guitarVoicings(
  symbol: string,
  notation: Notation = 'en',
  limit = 24,
): GuitarVoicing[] {
  const cacheKey = `${notation}:${symbol}`;
  const cached = guitarCache.get(cacheKey);
  if (cached) return cached.slice(0, limit);

  const tones = chordTones(symbol, notation);
  if (!tones) return [];

  const allowed = new Set([...tones.required, ...tones.optional]);
  const pitches = new Set(
    [...allowed].map((interval) => (tones.root + interval) % 12),
  );
  if (tones.bass !== null) pitches.add(tones.bass);

  const found = new Map<string, Candidate>();

  for (let start = 1; start <= HIGHEST_START; start += 1) {
    const options = TUNING.map((open) => {
      const choices: (number | null)[] = [null];
      if (start <= OPEN_UNTIL && pitches.has(open)) choices.push(0);
      for (let fret = start; fret < start + WINDOW; fret += 1) {
        if (pitches.has((open + fret) % 12)) choices.push(fret);
      }
      return choices;
    });

    const frets: (number | null)[] = [];
    const walk = (string: number) => {
      if (string === TUNING.length) {
        const candidate = evaluate([...frets], tones, allowed);
        if (!candidate) return;
        const key = frets.map((fret) => fret ?? 'x').join(',');
        const known = found.get(key);
        if (!known || candidate.score < known.score) found.set(key, candidate);
        return;
      }
      for (const choice of options[string] ?? []) {
        frets.push(choice);
        walk(string + 1);
        frets.pop();
      }
    };
    walk(0);
  }

  const voicings = [...found.values()]
    .toSorted((a, b) => a.score - b.score)
    .slice(0, 24)
    .map((candidate) => candidate.voicing);

  guitarCache.set(cacheKey, voicings);
  return voicings.slice(0, limit);
}

/** Ein Griff als Kurzschrift, wie in Liederbüchern: „x32010". */
export function fretPattern(voicing: GuitarVoicing): string {
  const parts = voicing.frets.map((fret) =>
    fret === null ? 'x' : String(fret),
  );
  return parts.some((part) => part.length > 1)
    ? parts.join('-')
    : parts.join('');
}

// -------------------------------------------------------------- Klavier

export interface PianoVoicing {
  /** Die angeschlagenen Tasten, Halbtöne ab dem C der untersten Oktave. */
  notes: number[];
  /** Was diese Lage ist — „Grundstellung", „1. Umkehrung". */
  label: string;
}

/**
 * Wie hoch jeder Ton in der Grundstellung liegt.
 *
 * Der Kern — Grundton, Terz (oder was sie vertritt), Quinte, Sexte oder
 * Septime — liegt in der Oktave; alles darüber hinaus (None, Undezime,
 * Alterationen) eine Oktave höher, wie man es greift.
 */
function stackHeights(intervals: number[]): number[] {
  const all = new Set(intervals);
  const core = new Set<number>([0]);
  const third = [4, 3, 5, 2].find((value) => all.has(value));
  if (third !== undefined) core.add(third);
  const fifth = [7, 6, 8].find((value) => all.has(value));
  if (fifth !== undefined) core.add(fifth);
  const seventh = [10, 11, 9].find((value) => all.has(value));
  if (seventh !== undefined) core.add(seventh);

  return intervals
    .map((interval) => (core.has(interval) ? interval : interval + 12))
    .toSorted((a, b) => a - b);
}

/**
 * Die Lagen eines Akkords auf dem Klavier: Grundstellung und Umkehrungen.
 *
 * Auf dem Klavier gibt es keinen Griff zu suchen, nur die Frage, welcher Ton
 * unten liegt. Ein Slash-Akkord bekommt seinen Bass eine Oktave tiefer dazu.
 */
export function pianoVoicings(
  symbol: string,
  notation: Notation = 'en',
): PianoVoicing[] {
  const tones = chordTones(symbol, notation);
  if (!tones) return [];

  const stacked = stackHeights([...tones.required, ...tones.optional]);

  // Eine Oktave über dem Bass, wenn es einen eigenen gibt.
  const lift = tones.bass !== null ? 12 : 0;
  const base = stacked.map((height) => tones.root + height + lift);

  const chordCount = Math.min(stacked.length, 4);
  const labels = [
    'Grundstellung',
    '1. Umkehrung',
    '2. Umkehrung',
    '3. Umkehrung',
  ];

  return Array.from({ length: chordCount }, (_, inversion) => {
    const notes = base.map((note, index) =>
      index < inversion ? note + 12 : note,
    );
    const withBass = tones.bass !== null ? [tones.bass, ...notes] : notes;
    return {
      notes: withBass.toSorted((a, b) => a - b),
      label: labels[inversion] ?? `${inversion}. Umkehrung`,
    };
  });
}
