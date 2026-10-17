/**
 * Ein Liedblatt als ChordPro-Text — das Format, in dem eine eigene Version
 * gespeichert wird.
 *
 * Warum nicht „Akkorde über dem Text", wie man es einfügt: Dort hängt die
 * Stelle eines Akkords an Leerzeichen, und zwei Akkorde, die enger stehen als
 * der erste breit ist („Asus4" und gleich danach „D"), lassen sich gar nicht
 * hinschreiben. In ChordPro steht der Akkord im Text, an seiner Stelle, ganz
 * gleich, wie breit er ist.
 *
 * Die Zusage dieses Moduls ist die **Rundreise**: `parseSheet(toChordPro(s),
 * { format: 'chordpro' })` ergibt wieder `s`. Der Editor verlässt sich darauf
 * — jede Änderung in der Vorschau schreibt hierüber ins Textfeld zurück, und
 * das Textfeld ist es, woraus die Vorschau entsteht.
 */
import type { Sheet, SheetLine } from './parse';

function lineToChordPro(line: SheetLine): string {
  if (line.kind === 'blank') return '';
  // Eckige Klammern im Namen würden die Zeile beim Lesen zerteilen.
  if (line.kind === 'section') return `[${line.label.replace(/[[\]]/g, '')}]`;

  const chords = line.chords.toSorted((a, b) => a.at - b.at);
  let out = '';
  let position = 0;

  for (const { at, chord } of chords) {
    if (at > position) {
      // Reicht der Akkord über das Textende hinaus, wird mit Leerzeichen
      // aufgefüllt — in einer reinen Akkordzeile ist das der Abstand.
      out += line.text.slice(position, at).padEnd(at - position, ' ');
      position = at;
    }
    out += `[${chord}]`;
  }

  return out + line.text.slice(position);
}

export function toChordPro(sheet: Sheet): string {
  const head: string[] = [];
  if (sheet.key) head.push(`{key: ${sheet.key}}`);
  if (sheet.capo) head.push(`{capo: ${sheet.capo}}`);

  return [...head, ...sheet.lines.map(lineToChordPro)].join('\n');
}
