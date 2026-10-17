/**
 * In welcher Tonart ein Lied steht — aus seinen Akkorden geschlossen.
 *
 * Nennt die Quelle die Tonart („Key: A", `{key: A}`), gilt sie. Sonst wird
 * gezählt: Jede der zwölf Dur-Tonarten bekommt einen Punkt für jeden Akkord,
 * der zu ihren sechs Stufen passt (I ii iii IV V vi, mit dem richtigen
 * Geschlecht), einen halben für die bVII, die im Lobpreis ständig vorkommt.
 * Erster und letzter Akkord zählen doppelt — ein Lied fängt fast immer auf
 * seinem Grundton an oder hört dort auf.
 *
 * Dur und die parallele Moll-Tonart teilen sich dieselben Akkorde. Zwischen
 * beiden entscheidet, worauf das Lied beginnt und endet.
 */
import {
  formatKey,
  isMinor,
  parseChord,
  parseKey,
  prefersFlats,
  spellNote,
  transposeChord,
  transposeKey,
  type Notation,
} from './chord';
import { chordsOf, type Sheet } from './parse';

/** Stufe → Geschlecht in Dur. */
const MAJOR_DEGREES: Record<number, 'maj' | 'min' | 'dim'> = {
  0: 'maj',
  2: 'min',
  4: 'min',
  5: 'maj',
  7: 'maj',
  9: 'min',
  11: 'dim',
};

/** `null` heißt: passt zu beidem — ein sus-Akkord, ein Powerchord. */
function qualityOf(suffix: string): 'maj' | 'min' | 'dim' | null {
  if (/^(?:dim|°|ø|m7b5)/.test(suffix)) return 'dim';
  if (isMinor(suffix)) return 'min';
  if (/^(?:sus|5$)/.test(suffix)) return null;
  return 'maj';
}

interface Played {
  root: number;
  quality: 'maj' | 'min' | 'dim' | null;
}

function scoreMajor(tonic: number, chords: Played[]): number {
  let score = 0;

  chords.forEach((chord, index) => {
    const weight = index === 0 || index === chords.length - 1 ? 2 : 1;
    const degree = (chord.root - tonic + 12) % 12;
    const expected = MAJOR_DEGREES[degree];

    if (expected && (chord.quality === null || chord.quality === expected)) {
      score += weight;
    } else if (degree === 10 && chord.quality !== 'min') {
      score += weight / 2;
    }
  });

  // Gleichstand: Wer auf dem Grundton beginnt oder endet, gewinnt.
  if (chords[0]?.root === tonic) score += 0.25;
  if (chords[chords.length - 1]?.root === tonic) score += 0.25;

  return score;
}

/**
 * Die Tonart des Blatts, etwa `A` oder `F#m` — oder `null` ohne Akkorde.
 */
export function detectKey(sheet: Sheet): string | null {
  if (sheet.key) {
    const given = parseKey(sheet.key, sheet.notation);
    return given
      ? formatKey(given.root, given.minor, sheet.notation)
      : sheet.key;
  }

  const chords = chordsOf(sheet).flatMap((symbol): Played[] => {
    const chord = parseChord(symbol, sheet.notation);
    return chord
      ? [{ root: chord.root, quality: qualityOf(chord.suffix) }]
      : [];
  });

  const first = chords[0];
  const last = chords.at(-1);
  if (!first || !last) return null;

  let best = 0;
  let bestScore = -1;
  for (let tonic = 0; tonic < 12; tonic += 1) {
    const score = scoreMajor(tonic, chords);
    if (score > bestScore) {
      best = tonic;
      bestScore = score;
    }
  }

  // Die parallele Moll-Tonart, wenn das Lied auf ihr beginnt oder endet und
  // nicht zugleich auf der Dur-Tonika.
  const relative = (best + 9) % 12;
  const onMinor = (chord: Played) =>
    chord.root === relative && chord.quality === 'min';
  const onMajor = (chord: Played) => chord.root === best;

  const minor =
    (onMinor(first) || onMinor(last)) && !onMajor(first) && !onMajor(last);

  return minor
    ? formatKey(relative, true, sheet.notation)
    : formatKey(best, false, sheet.notation);
}

/**
 * Die sechs Akkorde, die in einer Tonart naheliegen — als Vorschläge, wenn im
 * Editor ein Akkord dazukommt.
 */
export function diatonicChords(key: string, notation: Notation): string[] {
  const parsed = parseKey(key, notation);
  if (!parsed) return [];

  const tonic = parsed.minor ? (parsed.root + 3) % 12 : parsed.root;
  const flats = prefersFlats(tonic, false);
  const name = (offset: number, minor: boolean) =>
    `${spellNote(tonic + offset, { flats, notation })}${minor ? 'm' : ''}`;

  const major = [
    name(0, false),
    name(2, true),
    name(4, true),
    name(5, false),
    name(7, false),
    name(9, true),
  ];

  // In Moll beginnt die Reihe auf der vi: Am, C, Dm, Em, F, G.
  return parsed.minor ? [...major.slice(5), ...major.slice(0, 5)] : major;
}

/**
 * Was jeder Akkord eines Blatts wird, wenn es um `steps` Halbtöne verschoben
 * ist — samt der Tonart, in der es dann steht.
 *
 * Ob mit ♯ oder ♭ geschrieben wird, entscheidet die **Ziel**-Tonart, nicht der
 * einzelne Akkord: In Bb heißt der vierte Akkord Eb und nicht D#, auch wenn
 * er aus einem D entstanden ist.
 */
export function transposer(
  sheet: Sheet,
  steps: number,
): { key: string | null; chord: (symbol: string) => string } {
  const key = detectKey(sheet);
  if (steps % 12 === 0) return { key, chord: (symbol) => symbol };

  const target = key ? transposeKey(key, steps, sheet.notation) : null;
  const parsed = target ? parseKey(target, sheet.notation) : null;
  const flats = parsed ? prefersFlats(parsed.root, parsed.minor) : false;

  return {
    key: target,
    chord: (symbol) =>
      transposeChord(symbol, steps, { flats, notation: sheet.notation }),
  };
}
