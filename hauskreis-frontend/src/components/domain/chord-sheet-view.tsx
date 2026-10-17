'use client';

/**
 * Ein Liedblatt zum Lesen — auf der Liedseite und im Vollbild. Die Zeile mit
 * Akkorden (`ChordLyricLine`) nutzt auch der Editor für seine Vorschau.
 *
 * **Der Akkord steht über dem Text und nimmt ihm keinen Platz.** Jedes Stück
 * Text trägt seine Akkorde selbst und bricht mit ihnen um
 * (`lib/chords/layout.ts`); die Akkorde darüber sind aber absolut gesetzt und
 * haben keine Breite. Sie hatten einmal eine, und dann schob ein Akkord, der
 * breiter war als seine Silbe, den Text dahinter nach rechts — „It's who
 * ␣␣␣ You are". Jetzt läuft der Text, wie er geschrieben ist, und stehen zwei
 * Akkorde so eng, dass sie sich berühren würden, rückt der zweite ein Stück
 * weiter (`useChordSpacing`). So machen es Akkordblätter auf Papier auch.
 *
 * **Das letzte Stück einer Zeile ist die Ausnahme**: Dort stehen die Akkorde im
 * Fluss. Dahinter kommt kein Text mehr, dem sie Platz nehmen könnten, und so
 * ragt „Dsus4" am Zeilenende nicht über den Rand der Karte. Ein leeres Stück
 * trägt ein Zeichen ohne Breite, damit es seine Zeilenhöhe hat — ohne das
 * landete ein Akkord hinter dem letzten Wort auf Höhe des Texts.
 *
 * Im Modus `text` verschwinden Akkorde ganz, samt der Zeilen, die nur aus
 * Akkorden bestehen: Wer mitsingt, braucht kein Vorspiel.
 *
 * Mit `onChord` (im Vollbild) ist jeder Akkord ein Knopf — ein Tipp zeigt, wie
 * man ihn greift.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import {
  wordsOf,
  type ChordInSegment,
  type Sheet,
  type SheetLine,
} from '@/lib/chords';
import { cn } from '@/lib/cn';

export type SheetMode = 'chords' | 'text';

type LyricLine = Extract<SheetLine, { kind: 'lyric' }>;

const UNCHANGED = (symbol: string) => symbol;

/** Das Zeichen ohne Breite, das einem leeren Textstück seine Höhe gibt. */
const NO_WIDTH = '\u200b';

export function ChordSheetView({
  sheet,
  chord = UNCHANGED,
  mode = 'chords',
  scale = 1,
  onChord,
  className,
}: {
  sheet: Sheet;
  /** Was aus einem Akkord wird — die Transposition (`transposer`). */
  chord?: (symbol: string) => string;
  mode?: SheetMode;
  /** Schriftgröße relativ zur Grundgröße, für das Vollbild. */
  scale?: number;
  /** Ein Akkord wurde angetippt — mit dem Namen, wie er dasteht. */
  onChord?: (shown: string) => void;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  useChordSpacing(root);

  return (
    <div
      ref={root}
      className={cn('text-[15px] leading-snug text-stone-800', className)}
      style={scale === 1 ? undefined : { fontSize: `${15 * scale}px` }}
    >
      {/* Eine Zeile hat keine Identität außer ihrem Platz im Blatt — gleiche
          Zeilen kommen in jedem Refrain vor. */}
      {sheet.lines.map((line, index) => (
        <SheetLineView
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          line={line}
          chord={chord}
          mode={mode}
          onChord={onChord}
        />
      ))}
    </div>
  );
}

function SheetLineView({
  line,
  chord,
  mode,
  onChord,
}: {
  line: SheetLine;
  chord: (symbol: string) => string;
  mode: SheetMode;
  onChord?: (shown: string) => void;
}) {
  const label = (symbol: string, key: number) => {
    const shown = chord(symbol);
    if (!onChord) return <ChordLabel key={key}>{shown}</ChordLabel>;
    // Ein Knopf, und der Tipp bleibt bei ihm: Die Fläche darunter schaltet im
    // Vollbild die Leiste.
    return (
      <button
        key={key}
        type="button"
        aria-label={`So greift man ${shown}`}
        onClick={(event) => {
          event.stopPropagation();
          onChord(shown);
        }}
        className="-mx-0.5 rounded px-0.5 hover:bg-terracotta-50"
      >
        <ChordLabel>{shown}</ChordLabel>
      </button>
    );
  };

  if (line.kind === 'blank') return <div className="h-[0.9em]" />;

  if (line.kind === 'section') {
    return <SectionLabel>{line.label}</SectionLabel>;
  }

  if (mode === 'text' || line.chords.length === 0) {
    if (line.text.trim() === '') return null;
    return <p className="whitespace-pre-wrap">{line.text.trimEnd()}</p>;
  }

  // Nur Akkorde: ein Vorspiel, ein Zwischenspiel. Abstand statt Spalten —
  // wie weit sie im Original auseinanderstanden, sagt nichts.
  if (line.text === '') {
    return (
      <p className="flex flex-wrap gap-x-[1.1em] py-0.5">
        {/* Zwei gleiche Akkorde an derselben Stelle sind möglich (`[A][A]`),
            deshalb der Platz als Schlüssel. */}
        {line.chords.map((entry, index) => label(entry.chord, index))}
      </p>
    );
  }

  return (
    <ChordLyricLine
      line={line}
      renderChord={(entry) => label(entry.chord, entry.index)}
    />
  );
}

/**
 * Eine Textzeile mit ihren Akkorden darüber.
 *
 * `renderChord` zeichnet einen Akkord — in der Ansicht ein Name, im Editor ein
 * Chip, den man ziehen und antippen kann. Jedes Textstück trägt `data-start`,
 * die Stelle im Text, an der es beginnt: Daran rechnet der Editor aus, wohin
 * ein Tipp oder ein losgelassener Akkord gehört.
 */
export function ChordLyricLine({
  line,
  renderChord,
  lineIndex,
  className,
  onClick,
}: {
  line: LyricLine;
  renderChord: (entry: ChordInSegment) => React.ReactNode;
  /** Für den Editor, der die Zeile unter einem Punkt finden will. */
  lineIndex?: number;
  className?: string;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
}) {
  const words = wordsOf(line);
  const last = words.at(-1)?.at(-1);

  return (
    // Ein Klick und keine Taste: Wer mit der Tastatur arbeitet, ändert den
    // Text im Feld darüber. Ohne `onClick` ist es ohnehin nur eine Zeile.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      data-chord-line=""
      data-line={lineIndex}
      onClick={onClick}
      className={cn('flex flex-wrap items-end', className)}
    >
      {words.map((word) => (
        <span
          key={word[0]?.start}
          className="inline-flex items-end whitespace-nowrap"
        >
          {word.map((segment) => {
            const chords = segment.chords.length > 0 && (
              <span
                data-chord-anchor=""
                className={cn(
                  'flex items-end gap-[0.3em] whitespace-nowrap',
                  segment === last ? 'pr-[0.3em]' : 'absolute bottom-0 left-0',
                )}
              >
                {segment.chords.map(renderChord)}
              </span>
            );

            return (
              <span key={segment.start} className="inline-flex flex-col">
                <span className="relative flex h-[1.45em] items-end">
                  {chords}
                </span>
                <span data-start={segment.start} className="whitespace-pre">
                  {segment.text || NO_WIDTH}
                </span>
              </span>
            );
          })}
        </span>
      ))}
    </div>
  );
}

/**
 * Rückt Akkorde auseinander, die sich sonst berührten.
 *
 * Gemessen und nicht gerechnet: Wo ein Akkord steht, hängt an der Schrift, an
 * der Breite des Bildschirms und daran, wo die Zeile umbricht. Je Zeile werden
 * die Akkorde der Reihe nach durchgegangen; steht einer in derselben sichtbaren
 * Zeile wie sein Vorgänger und zu nah an ihm, rückt er per `translate` nach
 * rechts. `translate` und nicht `left`: Es ändert das Layout nicht, also auch
 * nichts an der Messung der übrigen.
 *
 * Bei jedem Rendern — ein transponierter Akkord ist breiter oder schmaler, ohne
 * dass sich die Größe des Blatts ändert — und bei jeder Größenänderung.
 */
export function useChordSpacing(ref: React.RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    spaceChords(ref.current);
  });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => spaceChords(element));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
}

function spaceChords(root: HTMLElement | null) {
  if (!root) return;

  const lines = [...root.querySelectorAll<HTMLElement>('[data-chord-line]')];
  const anchors = lines.map((line) => [
    ...line.querySelectorAll<HTMLElement>('[data-chord-anchor]'),
  ]);

  // Erst alles zurück, dann messen: So wird das Layout einmal berechnet und
  // nicht nach jedem verschobenen Akkord neu.
  for (const row of anchors) {
    for (const anchor of row) anchor.style.translate = '';
  }

  lines.forEach((line, index) => {
    const row = anchors[index] ?? [];
    if (row.length < 2) return;

    const gap = Number.parseFloat(getComputedStyle(line).fontSize) * 0.4;
    let previousRight = -Infinity;
    let previousTop = Number.NaN;

    for (const anchor of row) {
      const rect = anchor.getBoundingClientRect();
      const sameRow = Math.abs(rect.top - previousTop) < 2;
      const shift = sameRow ? Math.max(0, previousRight + gap - rect.left) : 0;
      if (shift > 0) anchor.style.translate = `${shift}px 0`;
      previousRight = rect.right + shift;
      previousTop = rect.top;
    }
  });
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-[0.6em] mb-[0.25em] text-[0.72em] font-bold tracking-widest text-terracotta-600 uppercase first:mt-0">
      {children}
    </p>
  );
}

export function ChordLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[0.88em] leading-tight font-bold text-terracotta-600">
      {children}
    </span>
  );
}
