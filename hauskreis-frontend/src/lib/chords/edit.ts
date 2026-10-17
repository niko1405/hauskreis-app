/**
 * Was man in der Vorschau des Editors mit einem Akkord tun kann — als reine
 * Funktionen über dem Blatt.
 *
 * Jede gibt ein neues Blatt zurück und lässt das alte stehen; der Editor legt
 * es über `toChordPro` ins Textfeld, und dessen alte Stände sind das
 * „Rückgängig".
 */
import type { ChordAt, Sheet, SheetLine } from './parse';

/** Ein Akkord im Blatt: in welcher Zeile, der wievielte. */
export interface ChordRef {
  line: number;
  index: number;
}

type LyricLine = Extract<SheetLine, { kind: 'lyric' }>;

/** Abstand zwischen zwei Akkorden einer reinen Akkordzeile. */
const CHORD_ONLY_GAP = 4;

/**
 * Bringt eine Zeile in ihre Normalform.
 *
 * Akkorde nach Stelle sortiert. Eine reine Akkordzeile bekommt gleichmäßige
 * Abstände — dort zählt nur die Reihenfolge. Eine Textzeile verliert
 * Leerzeichen am Ende, die keinen Akkord mehr tragen: Sie stammen vom
 * Auffüllen für einen Akkord hinter dem letzten Wort, und ohne ihn wären sie
 * ein Unterschied, den das Speichern (`trimEnd`) wieder wegnähme.
 */
function normalize(line: LyricLine): LyricLine {
  const chords = line.chords.toSorted((a, b) => a.at - b.at);

  if (line.text === '') {
    return {
      ...line,
      chords: chords.map((chord, index) => ({
        ...chord,
        at: index * CHORD_ONLY_GAP,
      })),
    };
  }

  const last = chords.at(-1)?.at ?? 0;
  const keep = Math.max(line.text.trimEnd().length, last);

  return { ...line, text: line.text.slice(0, keep), chords };
}

function withLine(
  sheet: Sheet,
  index: number,
  change: (line: LyricLine) => LyricLine,
): Sheet {
  const line = sheet.lines[index];
  if (!line || line.kind !== 'lyric') return sheet;

  const lines = sheet.lines.slice();
  lines[index] = normalize(change(line));
  return { ...sheet, lines };
}

/** Die Stelle in den Rahmen der Zeile — bis direkt hinter das letzte Zeichen. */
function clampAt(line: LyricLine, at: number): number {
  if (line.text === '') return at;
  return Math.max(0, Math.min(at, line.text.length));
}

export function insertChord(
  sheet: Sheet,
  lineIndex: number,
  at: number,
  chord: string,
): Sheet {
  return withLine(sheet, lineIndex, (line) => ({
    ...line,
    chords: [...line.chords, { at: clampAt(line, at), chord }],
  }));
}

export function removeChord(sheet: Sheet, ref: ChordRef): Sheet {
  return withLine(sheet, ref.line, (line) => ({
    ...line,
    chords: line.chords.filter((_, index) => index !== ref.index),
  }));
}

export function renameChord(sheet: Sheet, ref: ChordRef, chord: string): Sheet {
  return withLine(sheet, ref.line, (line) => ({
    ...line,
    chords: line.chords.map((entry, index) =>
      index === ref.index ? { ...entry, chord } : entry,
    ),
  }));
}

/**
 * Einen Akkord an eine andere Stelle setzen — in derselben Zeile oder einer
 * anderen.
 *
 * In einer reinen Akkordzeile ist `at` eine **Position in der Reihe**: Der
 * Akkord landet vor dem, der bisher dort stand.
 */
export function moveChord(
  sheet: Sheet,
  from: ChordRef,
  to: { line: number; at: number },
): Sheet {
  const source = sheet.lines[from.line];
  if (!source || source.kind !== 'lyric') return sheet;
  const moved: ChordAt | undefined = source.chords[from.index];
  if (!moved) return sheet;

  const target = sheet.lines[to.line];
  if (!target || target.kind !== 'lyric') return sheet;

  const without = removeChord(sheet, from);
  const landing = without.lines[to.line] as LyricLine;

  // In der Akkordzeile wird zwischen die Nachbarn geschoben: einen halben
  // Schritt vor den Akkord, der an dieser Stelle steht, und `normalize`
  // verteilt danach neu. Gezählt wird die Reihe, wie man sie sieht — steht der
  // gezogene Akkord selbst weiter vorn in ihr, rückt alles dahinter einen Platz
  // auf.
  const slot = to.line === from.line && to.at > from.index ? to.at - 1 : to.at;
  const at =
    landing.text === ''
      ? slot * CHORD_ONLY_GAP - CHORD_ONLY_GAP / 2
      : clampAt(landing, to.at);

  return withLine(without, to.line, (line) => ({
    ...line,
    chords: [...line.chords, { at, chord: moved.chord }],
  }));
}

/**
 * Einen Akkord um ein Zeichen schieben — die Feinarbeit, wenn das Ziehen mit
 * dem Finger nicht genau genug war. In einer Akkordzeile tauscht er den Platz
 * mit dem Nachbarn.
 */
export function nudgeChord(sheet: Sheet, ref: ChordRef, delta: -1 | 1): Sheet {
  const line = sheet.lines[ref.line];
  if (!line || line.kind !== 'lyric') return sheet;
  const chord = line.chords[ref.index];
  if (!chord) return sheet;

  if (line.text === '') {
    const swap = ref.index + delta;
    if (swap < 0 || swap >= line.chords.length) return sheet;
    // Getauscht wird die Reihenfolge; `normalize` verteilt die Abstände neu.
    return withLine(sheet, ref.line, (current) => ({
      ...current,
      chords: current.chords.map((entry, index) => {
        const place =
          index === ref.index ? swap : index === swap ? ref.index : index;
        return { ...entry, at: place * CHORD_ONLY_GAP };
      }),
    }));
  }

  const at = clampAt(line, chord.at + delta);
  if (at === chord.at) return sheet;

  return withLine(sheet, ref.line, (current) => ({
    ...current,
    chords: current.chords.map((entry, index) =>
      index === ref.index ? { ...entry, at } : entry,
    ),
  }));
}

/**
 * Wo ein Akkord nach einer Änderung steht — damit die Auswahl im Editor ihm
 * folgt, wenn das Sortieren ihn auf einen anderen Platz in der Liste schiebt.
 */
export function findChord(
  sheet: Sheet,
  lineIndex: number,
  at: number,
  chord: string,
): ChordRef | null {
  const line = sheet.lines[lineIndex];
  if (!line || line.kind !== 'lyric') return null;
  const index = line.chords.findIndex(
    (entry) => entry.at === at && entry.chord === chord,
  );
  return index === -1 ? null : { line: lineIndex, index };
}

// ---------------------------------------------------------------- Zeilen

/**
 * Eine Zeile entfernen — eine Seitenmarke aus der Kopie, eine Wiederholung,
 * die man nicht braucht. Ihre Akkorde gehen mit.
 */
export function removeLine(sheet: Sheet, index: number): Sheet {
  if (index < 0 || index >= sheet.lines.length) return sheet;
  return { ...sheet, lines: sheet.lines.filter((_, at) => at !== index) };
}

/** Eine Zeile hinter `after` einfügen; `-1` heißt ganz vorn. */
export function insertLine(
  sheet: Sheet,
  after: number,
  line: SheetLine,
): Sheet {
  const lines = sheet.lines.slice();
  lines.splice(Math.max(0, Math.min(after + 1, lines.length)), 0, line);
  return { ...sheet, lines };
}

export function setSectionLabel(
  sheet: Sheet,
  index: number,
  label: string,
): Sheet {
  const line = sheet.lines[index];
  const trimmed = label.trim();
  if (line?.kind !== 'section' || trimmed === '') return sheet;

  const lines = sheet.lines.slice();
  lines[index] = { kind: 'section', label: trimmed };
  return { ...sheet, lines };
}

/** Wie viele Zeichen zwei Texte vorn gemeinsam haben. */
function sharedStart(a: string, b: string): number {
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length]) {
    length += 1;
  }
  return length;
}

/** Wie viele Zeichen sie hinten gemeinsam haben — ohne in den Anfang zu greifen. */
function sharedEnd(a: string, b: string, start: number): number {
  let length = 0;
  while (
    length < a.length - start &&
    length < b.length - start &&
    a[a.length - 1 - length] === b[b.length - 1 - length]
  ) {
    length += 1;
  }
  return length;
}

/**
 * Den Text einer Zeile ändern, und die Akkorde wandern mit.
 *
 * Verglichen werden gleicher Anfang und gleiches Ende: Was davor steht, behält
 * seinen Akkord an derselben Stelle, was dahinter steht, rückt um die
 * Längendifferenz mit. Ein Akkord im geänderten Stück selbst landet an dessen
 * Anfang — wer ein Wort austauscht, meint meistens die Silbe, auf der er saß.
 *
 * Aus einer Leerzeile wird mit Text eine Textzeile; eine Textzeile ohne Text
 * wird zur Leerzeile, oder zur reinen Akkordzeile, wenn sie Akkorde trägt.
 */
export function setLineText(sheet: Sheet, index: number, text: string): Sheet {
  const line = sheet.lines[index];
  if (!line || line.kind === 'section') return sheet;

  const next = text.replace(/\s+$/, '');
  const lines = sheet.lines.slice();

  if (line.kind === 'blank') {
    if (next.trim() === '') return sheet;
    lines[index] = { kind: 'lyric', text: next, chords: [] };
    return { ...sheet, lines };
  }

  if (next.trim() === '') {
    lines[index] =
      line.chords.length === 0
        ? { kind: 'blank' }
        : normalize({ ...line, text: '' });
    return { ...sheet, lines };
  }

  // Leerzeichen am Ende tragen nur Akkorde hinter dem letzten Wort; sie
  // gehören nicht zu dem, was jemand am Text ändert.
  const before = line.text.trimEnd();
  const start = sharedStart(before, next);
  const end = sharedEnd(before, next, start);
  const shift = next.length - before.length;
  const tail = before.length - end;

  // Steht ein Akkord genau dort, wo nur eingefügt wurde, gehört er zum Wort
  // dahinter und rückt mit ihm: Wer „Oh " vor „[A]Amazing" schreibt, will das
  // A weiter auf „Amazing".
  const chords = line.chords.map((entry) => {
    if (line.text === '' || entry.at < start) return entry;
    if (entry.at >= tail) return { ...entry, at: entry.at + shift };
    return { ...entry, at: start };
  });
  const last = Math.max(0, ...chords.map((entry) => entry.at));

  lines[index] = normalize({
    ...line,
    text: next.padEnd(last, ' '),
    chords,
  });
  return { ...sheet, lines };
}
