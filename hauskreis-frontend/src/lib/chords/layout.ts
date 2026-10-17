/**
 * Eine Textzeile in Stücke zerlegt, über denen je ein Akkord steht.
 *
 * Akkorde über Text lassen sich auf dem Telefon nicht als zwei Zeilen setzen,
 * eine über der anderen: Die Textzeile bricht um, die Akkordzeile darüber
 * nicht, und ab dem Umbruch stünde jeder Akkord über dem falschen Wort. Also
 * wird die Zeile in **Segmente** zerlegt — ein Stück Text mit dem Akkord, der
 * an seinem Anfang steht —, und jedes Segment trägt seinen Akkord selbst.
 * Bricht die Zeile um, nimmt jedes Segment seinen Akkord mit.
 *
 * Die Segmente sind in **Wörter** gruppiert, damit nur zwischen Wörtern
 * umgebrochen wird: Ein Akkord mitten im Wort („sin[D]gen") teilt das Wort in
 * zwei Segmente, die trotzdem zusammenbleiben.
 */
import type { SheetLine } from './parse';

export interface ChordInSegment {
  chord: string;
  /** Der wievielte Akkord der Zeile — für den Editor, der ihn ansprechen will. */
  index: number;
}

export interface Segment {
  /** Wo das Stück im Text beginnt. */
  start: number;
  text: string;
  /** Meist einer, selten keiner, ganz selten zwei an derselben Stelle. */
  chords: ChordInSegment[];
}

export type Word = Segment[];

type LyricLine = Extract<SheetLine, { kind: 'lyric' }>;

function startsWord(text: string, position: number): boolean {
  return (
    position < text.length &&
    text[position] !== ' ' &&
    (position === 0 || text[position - 1] === ' ')
  );
}

export function wordsOf(line: LyricLine): Word[] {
  const { text } = line;
  const placed = line.chords.map((entry, index) => ({
    ...entry,
    at: Math.max(0, Math.min(entry.at, text.length)),
    index,
  }));

  const cuts = new Set<number>([0]);
  for (let position = 0; position < text.length; position += 1) {
    if (startsWord(text, position)) cuts.add(position);
  }
  for (const { at } of placed) cuts.add(at);

  const points = [...cuts].toSorted((a, b) => a - b);
  const words: Word[] = [];

  points.forEach((start, k) => {
    const end = points[k + 1] ?? text.length;
    const segment: Segment = {
      start,
      text: text.slice(start, end),
      chords: placed
        .filter((entry) => entry.at === start)
        .map(({ chord, index }) => ({ chord, index })),
    };

    // Ein neues Wort, wo eines anfängt — und ganz am Anfang.
    const current = words.at(-1);
    if (!current || startsWord(text, start)) {
      words.push([segment]);
    } else {
      current.push(segment);
    }
  });

  return words;
}
