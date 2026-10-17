/**
 * Der Text einer Notiz — lesen, abhaken, formatieren.
 *
 * Reine Textarbeit ohne React und ohne `@/`-Importe, wie `lib/chords`: Was
 * hier entschieden wird, soll sich ohne die App prüfen lassen.
 *
 * **Gemacht für das, was Menschen tippen**, nicht für Markdown, wie es ein
 * Generator ausspuckt (dafür ist `components/ui/prose.tsx` da). Der Unterschied
 * steckt in einer Regel: **Jede Zeile bleibt eine Zeile.** In Markdown wären
 * zwei Zeilen ohne Leerzeile dazwischen ein Absatz — wer aber „Zelt" und
 * darunter „Schlafsack" schreibt, meint zwei Zeilen und wundert sich sonst.
 *
 * Verstanden werden `#`/`##` als Überschrift, `- `/`* ` als Liste, `1. ` als
 * nummerierte Liste, `- [ ]`/`- [x]` als Checkliste, `**fett**`, `[Text](url)`
 * und nackte `https://`-Adressen. Alles andere bleibt Text: Nichts verschwindet,
 * nur weil es hier nicht verstanden wird.
 *
 * Die Regel für einen Checklistenpunkt steht auch im Backend
 * (`src/note/note-text.ts`), weil der Server abhakt. Ändert sie sich, dann an
 * beiden Stellen.
 */

/** `- [ ] Zelt`, `* [x] Schlafsack` — mit beliebiger Einrückung davor. */
const CHECK_LINE = /^(\s*[-*] \[)( |x|X)(\] )(.*)$/;
const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;

export interface CheckItem {
  /** Der wievielte Checklistenpunkt der ganzen Notiz — so zählt der Server. */
  index: number;
  text: string;
  done: boolean;
}

export type NoteBlock =
  | { kind: 'heading'; level: 1 | 2; text: string }
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'checklist'; items: CheckItem[] };

/** Der Text in Blöcke zerlegt, Zeile für Zeile. */
export function parseNote(body: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  let checks = 0;

  for (const raw of body.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const last = blocks.at(-1);

    if (line.trim() === '') {
      // Eine Leerzeile beendet, was gerade läuft. Mehrere hintereinander
      // tragen nichts weiter — der Abstand zwischen Blöcken ist schon da.
      blocks.push({ kind: 'paragraph', lines: [] });
      continue;
    }

    const heading = HEADING.exec(line.trim());
    if (heading) {
      blocks.push({
        kind: 'heading',
        level: (heading[1] ?? '#').length === 1 ? 1 : 2,
        text: heading[2] ?? '',
      });
      continue;
    }

    const check = CHECK_LINE.exec(line);
    if (check) {
      const item = {
        index: checks,
        text: check[4] ?? '',
        done: check[2] !== ' ',
      };
      checks += 1;
      if (last?.kind === 'checklist') last.items.push(item);
      else blocks.push({ kind: 'checklist', items: [item] });
      continue;
    }

    const ordered = ORDERED.exec(line);
    const bullet = ordered ? null : BULLET.exec(line);
    const item = ordered?.[1] ?? bullet?.[1];
    if (item !== undefined) {
      const isOrdered = ordered !== null;
      if (last?.kind === 'list' && last.ordered === isOrdered) {
        last.items.push(item);
      } else {
        blocks.push({ kind: 'list', ordered: isOrdered, items: [item] });
      }
      continue;
    }

    if (last?.kind === 'paragraph' && last.lines.length > 0) {
      last.lines.push(line);
    } else {
      blocks.push({ kind: 'paragraph', lines: [line] });
    }
  }

  // Die Platzhalter der Leerzeilen haben ihren Dienst getan.
  return blocks.filter(
    (block) => block.kind !== 'paragraph' || block.lines.length > 0,
  );
}

export type InlinePart =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'link'; text: string; href: string };

/**
 * `**fett**`, `[Text](url)` und nackte Adressen innerhalb einer Zeile.
 *
 * Links nur nach `http(s)`: Eine Notiz schreiben mehrere, und ein
 * `javascript:` im Klammerteil wäre ein Weg, jemand anderem etwas
 * unterzuschieben. Was dort sonst steht, bleibt als Text stehen.
 */
export function parseInline(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  const pattern =
    /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?"'])/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ kind: 'text', text: text.slice(last, match.index) });
    }
    const [whole, bold, label, href, bare] = match;
    if (bold !== undefined) {
      parts.push({ kind: 'bold', text: bold });
    } else if (label !== undefined && href !== undefined) {
      parts.push(
        /^https?:\/\//i.test(href)
          ? { kind: 'link', text: label, href }
          : { kind: 'text', text: whole },
      );
    } else if (bare !== undefined) {
      parts.push({ kind: 'link', text: bare, href: bare });
    }
    last = match.index + whole.length;
  }

  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts;
}

/** Wie viele Punkte abgehakt sind. */
export function checklistOf(body: string): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const line of body.split('\n')) {
    const match = CHECK_LINE.exec(line);
    if (!match) continue;
    total += 1;
    if (match[2] !== ' ') done += 1;
  }
  return { done, total };
}

/**
 * Hakt den `index`-ten Punkt ab oder wieder auf — dieselbe Regel wie der
 * Server, damit der Haken sofort dasteht. `null`, wenn dort inzwischen etwas
 * anderes steht.
 */
export function toggleCheck(
  body: string,
  index: number,
  text: string,
  done: boolean,
): string | null {
  const lines = body.split('\n');
  let seen = -1;

  for (const [position, line] of lines.entries()) {
    const match = CHECK_LINE.exec(line);
    if (!match) continue;
    seen += 1;
    if (seen !== index) continue;

    if ((match[4] ?? '').trim() !== text.trim()) return null;
    lines[position] =
      `${match[1]}${done ? 'x' : ' '}${match[3]}${match[4] ?? ''}`;
    return lines.join('\n');
  }

  return null;
}

// ------------------------------------------------------------- Formatieren

export interface TextEdit {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export type Format = 'heading' | 'list' | 'check' | 'bold';

const PREFIX: Record<Exclude<Format, 'bold'>, string> = {
  heading: '## ',
  list: '- ',
  check: '- [ ] ',
};

/** Was eine Zeile schon als Auszeichnung vorne trägt. */
const ANY_PREFIX = /^(\s*)(#{1,3}\s+|[-*] \[[ xX]\] |[-*]\s+|\d+[.)]\s+)?/;

/** Welche Auszeichnung eine Zeile trägt — eine Checkliste ist keine Liste. */
function formatOf(line: string): Format | 'ordered' | null {
  const marker = ANY_PREFIX.exec(line)?.[2];
  if (!marker) return null;
  if (marker.startsWith('#')) return 'heading';
  if (/^[-*] \[/.test(marker)) return 'check';
  if (/^\d/.test(marker)) return 'ordered';
  return 'list';
}

/**
 * Die Knöpfe über dem Textfeld: Überschrift, Liste, Checkliste, Fett.
 *
 * Für die ersten drei zählen die **Zeilen**, die die Auswahl berührt — wer
 * fünf Zeilen markiert und „Checkliste" drückt, bekommt fünf Punkte. Tragen
 * schon alle genau diese Auszeichnung, nimmt derselbe Knopf sie wieder weg;
 * eine andere wird ersetzt statt davorgesetzt. Fett umschließt die Auswahl,
 * ohne Auswahl landet der Cursor zwischen den Sternen.
 */
export function applyFormat(edit: TextEdit, format: Format): TextEdit {
  const { value, selectionStart, selectionEnd } = edit;

  if (format === 'bold') {
    const selected = value.slice(selectionStart, selectionEnd);
    const next = `${value.slice(0, selectionStart)}**${selected}**${value.slice(selectionEnd)}`;
    return {
      value: next,
      selectionStart: selectionStart + 2,
      selectionEnd: selectionEnd + 2,
    };
  }

  const prefix = PREFIX[format];
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const endBreak = value.indexOf('\n', selectionEnd);
  const lineEnd = endBreak === -1 ? value.length : endBreak;
  const lines = value.slice(lineStart, lineEnd).split('\n');

  const all = lines.every((line) => formatOf(line) === format);
  const changed = lines.map((line) => {
    const [whole, indent] = ANY_PREFIX.exec(line) ?? ['', ''];
    const rest = line.slice(whole.length);
    return all ? `${indent}${rest}` : `${indent}${prefix}${rest}`;
  });

  const replaced = changed.join('\n');
  const next = value.slice(0, lineStart) + replaced + value.slice(lineEnd);
  const delta = replaced.length - (lineEnd - lineStart);
  // Bei einer einzelnen Zeile ohne Auswahl wandert der Cursor mit, damit man
  // gleich weiterschreiben kann.
  return {
    value: next,
    selectionStart:
      selectionStart === selectionEnd
        ? Math.max(lineStart, selectionStart + delta)
        : lineStart,
    selectionEnd: Math.max(lineStart, selectionEnd + delta),
  };
}

/**
 * Enter in einer Liste setzt sie fort — wie in jeder Notiz-App.
 *
 * Steht hinter der Markierung etwas, beginnt die nächste Zeile mit derselben
 * (bei Checklisten unabgehakt, bei Nummern eins weiter). Ist der Punkt leer,
 * endet die Liste: Die Markierung verschwindet, und man schreibt normal weiter.
 * `null` heißt: kein Sonderfall, das Feld macht selbst einen Umbruch.
 */
export function continueList(edit: TextEdit): TextEdit | null {
  const { value, selectionStart, selectionEnd } = edit;
  if (selectionStart !== selectionEnd) return null;

  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const line = value.slice(lineStart, selectionStart);

  const check = /^(\s*[-*] )\[[ xX]\] (.*)$/.exec(line);
  const ordered = check ? null : /^(\s*)(\d+)([.)]) (.*)$/.exec(line);
  const bullet = check || ordered ? null : /^(\s*[-*] )(.*)$/.exec(line);

  const marker = check
    ? `${check[1]}[ ] `
    : ordered
      ? `${ordered[1]}${Number(ordered[2]) + 1}${ordered[3]} `
      : bullet
        ? (bullet[1] ?? '- ')
        : null;
  const content = check?.[2] ?? ordered?.[4] ?? bullet?.[2];
  if (marker === null || content === undefined) return null;

  if (content.trim() === '') {
    const next = value.slice(0, lineStart) + value.slice(selectionStart);
    return { value: next, selectionStart: lineStart, selectionEnd: lineStart };
  }

  const insert = `\n${marker}`;
  const next =
    value.slice(0, selectionStart) + insert + value.slice(selectionEnd);
  const cursor = selectionStart + insert.length;
  return { value: next, selectionStart: cursor, selectionEnd: cursor };
}
