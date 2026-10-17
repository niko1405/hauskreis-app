/**
 * Ein Akkord als Bild — Griffbrett oder Tastatur.
 *
 * Gezeichnet als SVG aus den Farben der App (`fill-stone-800`, `stroke-…`),
 * nicht aus festen Werten: Im dunklen Thema drehen sich die Tokens mit, und
 * das Bild bleibt lesbar, ohne dass es davon weiß.
 *
 * Woher die Griffe kommen, steht in `lib/chords/voicing.ts`; hier wird nur
 * gezeichnet.
 */
import type { GuitarVoicing, PianoVoicing } from '@/lib/chords';
import { cn } from '@/lib/cn';

export type Instrument = 'guitar' | 'piano';

const STRING_GAP = 10;
const FRET_GAP = 12;
const FRETS_SHOWN = 5;
const TOP = 14;
const LEFT = 6;

/** Ein Griffbild: sechs Saiten, fünf Bünde, Punkte mit Fingern darin. */
export function GuitarDiagram({
  voicing,
  strings,
  className,
}: {
  voicing: GuitarVoicing;
  /** Die Saitennamen unter dem Bild — „E A D G B E" (deutsch mit H). */
  strings?: string[];
  className?: string;
}) {
  const width = LEFT + STRING_GAP * 5 + 14;
  const height = TOP + FRET_GAP * FRETS_SHOWN + (strings ? 12 : 4);
  const x = (string: number) => LEFT + string * STRING_GAP;
  const y = (fret: number) =>
    TOP + (fret - voicing.baseFret) * FRET_GAP + FRET_GAP / 2;
  const nut = voicing.baseFret === 1;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn('block', className)}
      aria-hidden
    >
      {/* Bünde, der oberste als Sattel, wenn das Bild unten am Hals steht. */}
      {Array.from({ length: FRETS_SHOWN + 1 }, (_, row) => (
        <line
          // eslint-disable-next-line react/no-array-index-key
          key={row}
          x1={x(0)}
          x2={x(5)}
          y1={TOP + row * FRET_GAP}
          y2={TOP + row * FRET_GAP}
          className="stroke-stone-300"
          strokeWidth={row === 0 && nut ? 3 : 1}
          strokeLinecap="round"
        />
      ))}
      {Array.from({ length: 6 }, (_, string) => (
        <line
          // eslint-disable-next-line react/no-array-index-key
          key={string}
          x1={x(string)}
          x2={x(string)}
          y1={TOP}
          y2={TOP + FRET_GAP * FRETS_SHOWN}
          className="stroke-stone-300"
          strokeWidth={1}
        />
      ))}

      {!nut && (
        <text
          x={x(5) + 5}
          y={TOP + FRET_GAP / 2 + 2.5}
          className="fill-stone-500"
          fontSize={7}
          fontWeight={600}
        >
          {voicing.baseFret}
        </text>
      )}

      {/* Über dem Sattel: x für stumm, o für leer. */}
      {voicing.frets.map((fret, string) => {
        if (fret === null) {
          return (
            <g
              // eslint-disable-next-line react/no-array-index-key
              key={string}
              className="stroke-stone-500"
              strokeWidth={1.2}
              strokeLinecap="round"
            >
              <line
                x1={x(string) - 2.5}
                x2={x(string) + 2.5}
                y1={4.5}
                y2={9.5}
              />
              <line
                x1={x(string) - 2.5}
                x2={x(string) + 2.5}
                y1={9.5}
                y2={4.5}
              />
            </g>
          );
        }
        if (fret === 0) {
          return (
            <circle
              // eslint-disable-next-line react/no-array-index-key
              key={string}
              cx={x(string)}
              cy={7}
              r={2.6}
              className="fill-none stroke-stone-500"
              strokeWidth={1.2}
            />
          );
        }
        return null;
      })}

      {strings?.map((name, string) => (
        <text
          // eslint-disable-next-line react/no-array-index-key
          key={string}
          x={x(string)}
          y={TOP + FRET_GAP * FRETS_SHOWN + 9}
          textAnchor="middle"
          className="fill-stone-500"
          fontSize={6}
          fontWeight={600}
        >
          {name}
        </text>
      ))}

      {voicing.barre && (
        <rect
          x={x(voicing.barre.from) - 4}
          y={y(voicing.barre.fret) - 4}
          width={x(voicing.barre.to) - x(voicing.barre.from) + 8}
          height={8}
          rx={4}
          className="fill-stone-800"
        />
      )}

      {voicing.frets.map((fret, string) => {
        if (fret === null || fret === 0) return null;
        const finger = voicing.fingers[string] ?? 0;
        const underBarre =
          voicing.barre &&
          fret === voicing.barre.fret &&
          string >= voicing.barre.from &&
          string <= voicing.barre.to;
        return (
          // eslint-disable-next-line react/no-array-index-key
          <g key={string}>
            {!underBarre && (
              <circle
                cx={x(string)}
                cy={y(fret)}
                r={4}
                className="fill-stone-800"
              />
            )}
            {finger > 0 && (!underBarre || string === voicing.barre?.from) && (
              <text
                x={x(string)}
                y={y(fret) + 2.3}
                textAnchor="middle"
                className="fill-card"
                fontSize={6}
                fontWeight={700}
              >
                {finger}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

const WHITE = [0, 2, 4, 5, 7, 9, 11];
const BLACK = new Set([1, 3, 6, 8, 10]);
const KEY_WIDTH = 10;
const KEY_HEIGHT = 40;

/** Die Lage auf einer Tastatur — zwei Oktaven, mehr wenn nötig. */
export function PianoDiagram({
  voicing,
  root,
  className,
}: {
  voicing: PianoVoicing;
  /** Der Grundton als Halbtonzahl — er wird terracotta markiert. */
  root: number;
  className?: string;
}) {
  const lowest = Math.min(...voicing.notes);
  const highest = Math.max(...voicing.notes);
  const start = Math.floor(lowest / 12) * 12;
  const octaves = Math.max(2, Math.ceil((highest - start + 1) / 12));
  const whites = octaves * 7;

  const whiteX = (note: number) => {
    const octave = Math.floor((note - start) / 12);
    return (octave * 7 + WHITE.indexOf(((note % 12) + 12) % 12)) * KEY_WIDTH;
  };
  const blackX = (note: number) => {
    // Eine schwarze Taste sitzt auf der Fuge rechts der weißen darunter.
    return whiteX(note - 1) + KEY_WIDTH - 3;
  };

  const notes = Array.from(
    { length: octaves * 12 },
    (_, index) => start + index,
  );

  return (
    <svg
      viewBox={`-1 -1 ${whites * KEY_WIDTH + 2} ${KEY_HEIGHT + 2}`}
      className={cn('block', className)}
      aria-hidden
    >
      {notes
        .filter((note) => WHITE.includes(note % 12))
        .map((note) => (
          <rect
            key={note}
            x={whiteX(note)}
            y={0}
            width={KEY_WIDTH}
            height={KEY_HEIGHT}
            rx={1.5}
            className="fill-card stroke-stone-300"
            strokeWidth={0.8}
          />
        ))}
      {notes
        .filter((note) => BLACK.has(note % 12))
        .map((note) => (
          <rect
            key={note}
            x={blackX(note)}
            y={0}
            width={6}
            height={KEY_HEIGHT * 0.6}
            rx={1}
            className="fill-stone-700"
          />
        ))}
      {voicing.notes.map((note) => {
        const black = BLACK.has(note % 12);
        const cx = black ? blackX(note) + 3 : whiteX(note) + KEY_WIDTH / 2;
        const cy = black ? KEY_HEIGHT * 0.6 - 5 : KEY_HEIGHT - 6;
        return (
          <circle
            key={note}
            cx={cx}
            cy={cy}
            r={3}
            className={
              note % 12 === ((root % 12) + 12) % 12
                ? 'fill-terracotta-500'
                : black
                  ? 'fill-card'
                  : 'fill-stone-800'
            }
          />
        );
      })}
    </svg>
  );
}
