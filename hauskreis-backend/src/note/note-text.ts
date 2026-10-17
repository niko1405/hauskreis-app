/**
 * Was der Server vom Text einer Notiz wissen muss — und mehr nicht.
 *
 * Gelesen und dargestellt wird die Auszeichnung im Frontend
 * (`lib/notes/markdown.ts`). Der Server kennt nur die **Checklisten**, weil er
 * sie abhakt, und baut die Vorschau für die Liste, damit dort nicht jede
 * Notiz in voller Länge mitkommt. Die Regel für eine Checklistenzeile steht
 * hier und dort gleich; ändert sie sich, dann an beiden Stellen.
 */

/** `- [ ] Zelt`, `* [x] Schlafsack` — mit beliebiger Einrückung davor. */
const CHECK_LINE = /^(\s*[-*] \[)( |x|X)(\] )(.*)$/;

export interface ChecklistSummary {
  done: number;
  total: number;
}

/** Wie viele Punkte abgehakt sind — „3/5 erledigt" in der Liste. */
export function checklistOf(body: string): ChecklistSummary {
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
 * Hakt den `index`-ten Punkt ab oder wieder auf.
 *
 * `text` ist die Vorbedingung: Steht an dieser Stelle inzwischen etwas anderes
 * — jemand hat eine Zeile davor eingefügt oder den Punkt umgeschrieben —, gibt
 * es `null` statt den falschen Punkt zu treffen. Ein ETag wäre hier zu grob:
 * Zwei, die gleichzeitig verschiedene Punkte einer Packliste abhaken, sind der
 * Normalfall und kein Konflikt.
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

/**
 * Eine Zeile Vorschau, ohne Auszeichnung — für die Liste im Archiv.
 *
 * Zeilen werden mit Leerzeichen verbunden: Die Liste zeigt ohnehin nur eine
 * Zeile, und „Zelt Schlafsack Isomatte" liest sich dort besser als ein
 * abgeschnittenes „Zelt".
 */
export function previewOf(body: string, max = 160): string {
  const plain = body
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s*#{1,3}\s+/, '')
        .replace(/^\s*[-*] \[[ xX]\] /, '')
        .replace(/^\s*(?:[-*]|\d+\.)\s+/, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .trim(),
    )
    .filter((line) => line !== '')
    .join(' ');

  return plain.length <= max ? plain : `${plain.slice(0, max - 1).trimEnd()}…`;
}
