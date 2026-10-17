/**
 * Eingefügter Text → ein Liedblatt mit Akkorden an Zeichenpositionen.
 *
 * Zwei Formate kommen hier an, und keines muss man vorher auswählen:
 *
 * - **Akkorde über dem Text**, wie sie beim Kopieren von Ultimate Guitar und
 *   fast jeder anderen Seite entstehen. Die Spalte eines Akkords in seiner
 *   Zeile ist die Stelle im Text darunter.
 * - **ChordPro**, also `[A]Text [D]mehr Text`. Das ist zugleich das Format, in
 *   dem eine eigene Version gespeichert wird (`chordpro.ts`) — es hält die
 *   Stelle eines Akkords fest, ohne auf Leerzeichen angewiesen zu sein.
 *
 * Was beim Kopieren aus dem Netz mitkommt, wird vorher weggeräumt: geschützte
 * Leerzeichen (sie sehen aus wie Leerzeichen und brechen jede Spaltenrechnung),
 * Tabulatoren, die `[ch]`-Marken aus dem Quelltext von Ultimate Guitar. Zeilen
 * wie „Capo 2" oder „Key: A" werden zu Angaben statt zu Text.
 */
import { isChord, parseChord, type Notation } from './chord';

export interface ChordAt {
  /** Die Stelle im Text, vor der der Akkord steht — ab 0. */
  at: number;
  chord: string;
}

export type SheetLine =
  | { kind: 'section'; label: string }
  /**
   * Eine Textzeile mit ihren Akkorden. `text: ''` heißt: nur Akkorde — ein
   * Vorspiel, ein Zwischenspiel. Dort sagt `at` nur noch die Reihenfolge.
   */
  | { kind: 'lyric'; text: string; chords: ChordAt[] }
  | { kind: 'blank' };

export interface Sheet {
  lines: SheetLine[];
  /** Die Tonart, wenn die Quelle sie nennt. Sonst rechnet `detectKey`. */
  key: string | null;
  capo: number | null;
  notation: Notation;
}

export type SheetFormat = 'auto' | 'chordpro';

const TAB_WIDTH = 4;

/**
 * Wörter, mit denen ein Abschnitt beginnt — englisch, wie bei Ultimate Guitar,
 * und deutsch, wie in Liederbüchern.
 */
const SECTION_WORDS =
  '(?:pre-?|post-?)?(?:verse|vers|strophe|chorus|refrain|vorrefrain|bridge|intro|outro|interlude|zwischenspiel|instrumental|tag|ending|schluss|coda|hook|break|solo|turnaround|vamp)';

/** „Strophe 2", „Chorus:", „(Refrain 2x)" — eine Zeile, die nur das ist. */
const SECTION_LINE = new RegExp(
  `^\\(?(${SECTION_WORDS}(?:\\s*\\d+)?(?:\\s*\\(?\\s*(?:x\\s*\\d+|\\d+\\s*x)\\s*\\)?)?)\\s*:?\\)?$`,
  'i',
);

/** „Intro: A D E" — ein Abschnitt und gleich seine Akkorde dahinter. */
const SECTION_PREFIX = new RegExp(
  `^(${SECTION_WORDS}(?:\\s*\\d+)?)\\s*:\\s*(.+)$`,
  'i',
);

/** Zierrat in Akkordzeilen, der weder Akkord noch Text ist. */
const DECORATION =
  /^(?:\|+:?|:?\|+|\/+|-+|\.+|\*+|x\d+|\d+x|\(x?\d+x?\)|n\.?c\.?|%|→|>|~)$/i;

const KEY_LINE = /^(?:key|tonart)\s*[:=]?\s*([A-H][#b♯♭]?m?)\b/i;
const CAPO_LINE = /^(?:capo|kapo)\s*[:=]?\s*(\d{1,2})/i;
/** Angaben, die zum Spielen nichts beitragen und sonst als Text dastünden. */
const NOISE_LINE =
  /^(?:tuning|stimmung|difficulty|author|transcribed by|capo|kapo)\s*:/i;
/**
 * Eine Seitenmarke, wie sie beim Kopieren aus einer Druckansicht mitkommt:
 * „Page 1/3", „Seite 2 von 3", „1/3". Sie stünde sonst als Liedzeile da.
 */
const PAGE_LINE =
  /^(?:(?:page|seite|p\.)\s*)?\d{1,3}\s*(?:\/|of|von)\s*\d{1,3}$/i;

function expandTabs(line: string): string {
  let out = '';
  for (const char of line) {
    if (char === '\t') {
      out += ' '.repeat(TAB_WIDTH - (out.length % TAB_WIDTH));
    } else {
      out += char;
    }
  }
  return out;
}

/** Was beim Kopieren aus dem Netz mitkommt und keine Bedeutung hat. */
function clean(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[   ]/g, ' ')
    .replace(/​|‌|‍|﻿/g, '')
    .replace(/\[\/?(?:ch|tab)\]/gi, '')
    .split('\n')
    .map((line) => expandTabs(line).trimEnd());
}

/** Ein Wort einer Zeile samt Spalte, an der es beginnt. */
function tokens(line: string): { text: string; column: number }[] {
  const out: { text: string; column: number }[] = [];
  const pattern = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line)) !== null) {
    out.push({ text: match[0], column: match.index });
  }
  return out;
}

/** „(A)" und „A*" sind A; der Rest der Zeile entscheidet. */
function chordOf(token: string): string | null {
  const bare = token.replace(/^\(+/, '').replace(/[)*]+$/, '');
  return isChord(bare) ? bare : null;
}

/**
 * Ob eine Zeile aus Akkorden besteht.
 *
 * Mindestens einer, und sieben von zehn Wörtern — ohne Zierrat wie `|` oder
 * `x2`, der in Akkordzeilen steht, aber nichts über sie sagt. Dadurch bleibt
 * „Am I worthy" eine Textzeile und „A new day" ebenso, obwohl beide mit einem
 * Akkordnamen beginnen.
 */
function chordsOfLine(line: string): ChordAt[] | null {
  let words = 0;
  const chords: ChordAt[] = [];

  for (const token of tokens(line)) {
    if (DECORATION.test(token.text)) continue;
    words += 1;
    const chord = chordOf(token.text);
    // Steht vor dem Akkord eine Klammer, gilt die Stelle des Akkords selbst.
    if (chord) {
      const offset = token.text.indexOf(chord.charAt(0));
      chords.push({ at: token.column + Math.max(offset, 0), chord });
    }
  }

  if (chords.length === 0) return null;
  return chords.length / words >= 0.7 ? chords : null;
}

function sectionOf(line: string): string | null {
  const trimmed = line.trim();

  const inner = /^\[([^\]]+)\]$/.exec(trimmed)?.[1]?.trim();
  if (inner && !isChord(inner)) return inner;

  const plain = SECTION_LINE.exec(trimmed)?.[1];
  if (plain) return plain.trim();

  return null;
}

/**
 * Keine Leerzeilen an den Rändern — und in Eingefügtem höchstens einzeln.
 *
 * Nur dort: Eine Kopie aus dem Netz trägt Leerzeilen in Stapeln, die nichts
 * bedeuten. Im eigenen Text (`collapse: false`) hat sie jemand mit Absicht
 * gesetzt, um sich das Blatt übersichtlicher zu machen, und dann bleiben sie.
 */
function tidy(lines: SheetLine[], collapse: boolean): SheetLine[] {
  const out: SheetLine[] = [];
  for (const line of lines) {
    if (line.kind === 'blank') {
      const previous = out.at(-1);
      if (!previous) continue;
      if (collapse && previous.kind === 'blank') continue;
    }
    out.push(line);
  }
  while (out.at(-1)?.kind === 'blank') out.pop();
  return out;
}

/**
 * Ob das Blatt in deutscher Schreibweise steht.
 *
 * Ein H genügt: Im Englischen gibt es den Ton nicht unter diesem Namen.
 */
function notationOf(lines: SheetLine[]): Notation {
  for (const line of lines) {
    if (line.kind !== 'lyric') continue;
    if (line.chords.some(({ chord }) => /^H|\/H/.test(chord))) return 'de';
  }
  return 'en';
}

/** Die gemeinsame Einrückung von Akkord- und Textzeile — sie sagt nichts. */
function commonIndent(chordColumn: number, text: string): number {
  const textIndent = text.length - text.trimStart().length;
  return Math.min(chordColumn, text.trim() === '' ? chordColumn : textIndent);
}

// ------------------------------------------------------- Akkorde über Text

function parsePlain(raw: string[]): {
  lines: SheetLine[];
  key: string | null;
  capo: number | null;
} {
  let key: string | null = null;
  let capo: number | null = null;
  const lines: SheetLine[] = [];

  for (let index = 0; index < raw.length; index += 1) {
    const line = raw[index] ?? '';
    const trimmed = line.trim();

    if (trimmed === '') {
      lines.push({ kind: 'blank' });
      continue;
    }

    const keyMatch = KEY_LINE.exec(trimmed)?.[1];
    if (keyMatch && trimmed.split(/\s+/).length <= 3) {
      key = keyMatch;
      continue;
    }

    const capoMatch = CAPO_LINE.exec(trimmed);
    if (capoMatch) {
      capo = Number(capoMatch[1]) || null;
      continue;
    }

    if (NOISE_LINE.test(trimmed) || PAGE_LINE.test(trimmed)) continue;

    const section = sectionOf(trimmed);
    if (section) {
      lines.push({ kind: 'section', label: section });
      continue;
    }

    const [, label, rest] = SECTION_PREFIX.exec(trimmed) ?? [];
    if (label && rest) {
      const chords = chordsOfLine(rest);
      if (chords) {
        lines.push({ kind: 'section', label: label.trim() });
        lines.push({ kind: 'lyric', text: '', chords });
        continue;
      }
    }

    const chords = chordsOfLine(line);
    const firstChord = chords?.[0];
    if (!chords || !firstChord) {
      lines.push({ kind: 'lyric', text: line, chords: [] });
      continue;
    }

    // Eine Akkordzeile gehört zur Textzeile darunter — wenn es eine ist.
    const next = raw[index + 1];
    const nextIsText =
      next !== undefined &&
      next.trim() !== '' &&
      sectionOf(next.trim()) === null &&
      chordsOfLine(next) === null &&
      !KEY_LINE.test(next.trim()) &&
      !CAPO_LINE.test(next.trim());

    if (!nextIsText) {
      const first = firstChord.at;
      lines.push({
        kind: 'lyric',
        text: '',
        chords: chords.map(({ at, chord }) => ({ at: at - first, chord })),
      });
      continue;
    }

    const indent = commonIndent(firstChord.at, next);
    let text = next.slice(indent);
    const placed = chords.map(({ at, chord }) => ({ at: at - indent, chord }));

    // Ein Akkord hinter dem Zeilenende bleibt dort stehen, wo er stand — als
    // Pause nach dem letzten Wort, die man spielt.
    const last = placed.at(-1)?.at ?? 0;
    if (last > text.length) text = text.padEnd(last, ' ');

    lines.push({ kind: 'lyric', text, chords: placed });
    index += 1;
  }

  return { lines, key, capo };
}

// ------------------------------------------------------------------ ChordPro

const DIRECTIVE = /^\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}$/i;
const INLINE = /\[([^\]]*)\]/g;

function parseChordProLine(line: string): SheetLine {
  const chords: ChordAt[] = [];
  let text = '';
  let last = 0;
  let match: RegExpExecArray | null;

  INLINE.lastIndex = 0;
  while ((match = INLINE.exec(line)) !== null) {
    text += line.slice(last, match.index);
    const chord = (match[1] ?? '').trim();
    if (chord) chords.push({ at: text.length, chord });
    last = match.index + match[0].length;
  }
  text += line.slice(last);

  // Eine Zeile aus Akkorden und Leerzeichen ist eine reine Akkordzeile.
  if (text.trim() === '') text = '';

  return { kind: 'lyric', text, chords };
}

function parseChordPro(raw: string[]): {
  lines: SheetLine[];
  key: string | null;
  capo: number | null;
} {
  let key: string | null = null;
  let capo: number | null = null;
  const lines: SheetLine[] = [];

  for (const line of raw) {
    const trimmed = line.trim();

    if (trimmed === '') {
      lines.push({ kind: 'blank' });
      continue;
    }

    const directive = DIRECTIVE.exec(trimmed);
    if (directive) {
      const name = (directive[1] ?? '').toLowerCase();
      const value = (directive[2] ?? '').trim();

      if (name === 'key' && value) key = value;
      else if (name === 'capo') capo = Number(value) || null;
      else if (['c', 'comment', 'ci', 'cb', 'highlight'].includes(name)) {
        if (value) lines.push({ kind: 'section', label: value });
      } else if (name === 'soc' || name === 'start_of_chorus') {
        lines.push({ kind: 'section', label: value || 'Refrain' });
      } else if (name === 'sov' || name === 'start_of_verse') {
        lines.push({ kind: 'section', label: value || 'Strophe' });
      } else if (name === 'sob' || name === 'start_of_bridge') {
        lines.push({ kind: 'section', label: value || 'Bridge' });
      }
      // Titel, Interpret und das Ende eines Abschnitts tragen hier nichts:
      // Der Titel steht am Lied, und ein Abschnitt endet mit dem nächsten.
      continue;
    }

    const section = sectionOf(trimmed);
    if (section) {
      lines.push({ kind: 'section', label: section });
      continue;
    }

    lines.push(parseChordProLine(line));
  }

  return { lines, key, capo };
}

/**
 * Ob der Text ChordPro ist.
 *
 * Eine Direktive genügt. Sonst entscheiden Zeilen mit eingebetteten Akkorden —
 * aber nur, wenn keine Akkordzeile im anderen Format danebensteht: Wer bei
 * Ultimate Guitar kopiert, bekommt „[Verse 1]" und Akkordzeilen, und das
 * erste ist ein Abschnitt, kein Akkord.
 */
function looksLikeChordPro(raw: string[]): boolean {
  let inline = 0;
  let plain = 0;

  for (const line of raw) {
    const trimmed = line.trim();
    if (DIRECTIVE.test(trimmed)) return true;
    if (sectionOf(trimmed)) continue;

    const bracketed = [...trimmed.matchAll(INLINE)].some(([, inner]) =>
      isChord((inner ?? '').trim()),
    );
    if (bracketed) inline += 1;
    else if (chordsOfLine(line)) plain += 1;
  }

  return inline > 0 && plain === 0;
}

/**
 * Liest ein Liedblatt.
 *
 * `format: 'chordpro'` für das, was die App selbst geschrieben hat — dort
 * wird nicht geraten, ein Blatt ganz ohne Akkorde liest sich nicht zufällig
 * anders als beim Speichern, und selbst gesetzte Leerzeilen bleiben stehen.
 */
export function parseSheet(
  text: string,
  { format = 'auto' }: { format?: SheetFormat } = {},
): Sheet {
  const raw = clean(text);
  const chordPro = format === 'chordpro' || looksLikeChordPro(raw);
  const parsed = chordPro ? parseChordPro(raw) : parsePlain(raw);
  const lines = tidy(parsed.lines, format !== 'chordpro');

  return {
    lines,
    key: parsed.key,
    capo: parsed.capo,
    notation: notationOf(lines),
  };
}

/** Alle Akkorde des Blatts in Lesereihenfolge. */
export function chordsOf(sheet: Sheet): string[] {
  return sheet.lines.flatMap((line) =>
    line.kind === 'lyric' ? line.chords.map(({ chord }) => chord) : [],
  );
}

/** Ob das Blatt überhaupt einen Akkord trägt, den die App versteht. */
export function hasChords(sheet: Sheet): boolean {
  return chordsOf(sheet).some(
    (chord) => parseChord(chord, sheet.notation) !== null,
  );
}
