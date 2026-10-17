'use client';

/**
 * Die Akkorde eines Lieds als Bilder — oben im Vollbild, im Detail und beim
 * Anpassen.
 *
 * **Eine Wahl gilt für jede Stelle mit genau diesem Akkord.** Wer bei „C" die
 * dritte Variante nimmt, sieht sie oben in der Liste und bei jedem C im Text.
 * Gemerkt wird sie an der eigenen Version, je Instrument und unter dem Namen,
 * wie er dasteht — transponiert ist „D" ein anderer Akkord als „C", und ein
 * Griff für den einen sagt über den anderen nichts.
 *
 * Detail und Anpassen sind Flächen **in** der Ebene des Vollbilds und keine
 * Sheets: Zwei Ebenen, die beide auf Escape hören, schlössen einander. Das
 * Vollbild fragt deshalb selbst, ob gerade eine offen ist.
 */
import { ChevronLeft, ChevronRight, RotateCcw, X } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import {
  GuitarDiagram,
  PianoDiagram,
  type Instrument,
} from '@/components/domain/chord-diagram';
import {
  GUITAR_STRINGS,
  chordTones,
  guitarVoicings,
  pianoVoicings,
  type Notation,
} from '@/lib/chords';
import { cn } from '@/lib/cn';

const INSTRUMENT_KEY = 'hauskreis-lied-instrument';

/** Gitarre oder Klavier — je Gerät, wie die Schriftgröße. */
export function readInstrument(): Instrument {
  try {
    return window.localStorage.getItem(INSTRUMENT_KEY) === 'piano'
      ? 'piano'
      : 'guitar';
  } catch {
    return 'guitar';
  }
}

export function writeInstrument(instrument: Instrument): void {
  try {
    window.localStorage.setItem(INSTRUMENT_KEY, instrument);
  } catch {
    // Ohne Speicher gilt die Wahl eben nur für dieses Mal.
  }
}

/** Unter diesem Schlüssel steht die gewählte Variante an der eigenen Version. */
export function voicingKey(instrument: Instrument, chord: string): string {
  return `${instrument}:${chord}`;
}

/** Wie viele Varianten es für einen Akkord auf diesem Instrument gibt. */
export function variantCount(
  chord: string,
  instrument: Instrument,
  notation: Notation,
): number {
  return instrument === 'guitar'
    ? guitarVoicings(chord, notation).length
    : pianoVoicings(chord, notation).length;
}

function wrap(index: number, count: number): number {
  return count === 0 ? 0 : ((index % count) + count) % count;
}

/** Das Bild eines Akkords in der gewählten Variante. */
export function ChordFigure({
  chord,
  instrument,
  notation,
  index,
  strings = false,
  className,
}: {
  chord: string;
  instrument: Instrument;
  notation: Notation;
  index: number;
  /** Die Saitennamen darunter — im Detail, nicht in der Liste. */
  strings?: boolean;
  className?: string;
}) {
  if (instrument === 'guitar') {
    const list = guitarVoicings(chord, notation);
    const voicing = list[wrap(index, list.length)];
    if (!voicing) return <NoShape className={className} />;
    return (
      <GuitarDiagram
        voicing={voicing}
        strings={
          strings
            ? GUITAR_STRINGS.map((name) =>
                notation === 'de' && name === 'B' ? 'H' : name,
              )
            : undefined
        }
        className={className}
      />
    );
  }

  const list = pianoVoicings(chord, notation);
  const voicing = list[wrap(index, list.length)];
  const tones = chordTones(chord, notation);
  if (!voicing || !tones) return <NoShape className={className} />;
  return (
    <PianoDiagram voicing={voicing} root={tones.root} className={className} />
  );
}

function NoShape({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'flex aspect-square items-center justify-center rounded-md border border-dashed border-line text-center text-[10px] text-stone-400',
        className,
      )}
    >
      Kein Griff gefunden
    </span>
  );
}

/**
 * Alle Akkorde des Lieds nebeneinander — auf dem Telefon seitwärts zu
 * scrollen, am Rechner umbrochen. Ein Tipp öffnet den Akkord im Detail.
 */
export function ChordStrip({
  chords,
  instrument,
  notation,
  choices,
  onOpen,
}: {
  chords: string[];
  instrument: Instrument;
  notation: Notation;
  choices: Record<string, number>;
  onOpen: (chord: string) => void;
}) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
      {chords.map((chord) => (
        <button
          key={chord}
          type="button"
          onClick={() => onOpen(chord)}
          aria-label={`${chord} im Detail`}
          className={cn(
            'shrink-0 rounded-lg p-1.5 text-center transition-colors hover:bg-shell',
            instrument === 'guitar' ? 'w-[4.75rem]' : 'w-32',
          )}
        >
          <span className="block font-mono text-sm font-bold text-stone-800">
            {chord}
          </span>
          <ChordFigure
            chord={chord}
            instrument={instrument}
            notation={notation}
            index={choices[voicingKey(instrument, chord)] ?? 0}
            className="mt-1 w-full"
          />
        </button>
      ))}
    </div>
  );
}

/**
 * Eine Fläche unten im Vollbild — für den Akkord im Detail und fürs Anpassen.
 * Ein Tipp daneben schließt sie.
 */
export function Panel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col justify-end">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Schließen"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />
      <div
        role="dialog"
        aria-label={title}
        className="pb-safe relative rounded-t-[28px] border-t border-line bg-card shadow-xl"
      >
        <div className="mx-auto w-full max-w-md px-5 pt-3 pb-5">
          <div className="flex items-center">
            <IconButton label="Schließen" onClick={onClose}>
              <X size={20} />
            </IconButton>
            <p className="flex-1 text-center text-sm font-bold text-stone-700">
              {title}
            </p>
            <span className="size-9" />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Ein Akkord im Detail: groß, mit den Varianten zum Durchblättern.
 *
 * Geblättert wird im Kreis, und jede Variante gilt sofort — für die Liste oben
 * und für jedes Vorkommen im Text.
 */
export function ChordDetail({
  chord,
  instrument,
  notation,
  index,
  onIndex,
}: {
  chord: string;
  instrument: Instrument;
  notation: Notation;
  index: number;
  onIndex: (index: number) => void;
}) {
  const count = variantCount(chord, instrument, notation);
  const current = wrap(index, count);
  const piano =
    instrument === 'piano' ? pianoVoicings(chord, notation)[current] : null;

  return (
    <div className="flex flex-col items-center pt-1">
      <p className="font-mono text-4xl font-bold text-stone-900">{chord}</p>
      <div className="mt-4 flex w-full items-center justify-between gap-2">
        <IconButton
          label="Vorige Variante"
          disabled={count < 2}
          onClick={() => onIndex(wrap(current - 1, count))}
          className="disabled:opacity-30"
        >
          <ChevronLeft size={24} />
        </IconButton>
        <ChordFigure
          chord={chord}
          instrument={instrument}
          notation={notation}
          index={current}
          strings
          className={instrument === 'guitar' ? 'w-44' : 'w-full max-w-64'}
        />
        <IconButton
          label="Nächste Variante"
          disabled={count < 2}
          onClick={() => onIndex(wrap(current + 1, count))}
          className="disabled:opacity-30"
        >
          <ChevronRight size={24} />
        </IconButton>
      </div>
      {piano && (
        <p className="mt-3 text-sm font-semibold text-stone-600">
          {piano.label}
        </p>
      )}
      {count > 0 && (
        <p className="mt-2 text-xs text-stone-400 tabular-nums">
          {current + 1} von {count}
        </p>
      )}
    </div>
  );
}

/** Gitarre oder Klavier — und die gewählten Griffe zurück auf den ersten. */
export function AdjustPanelContent({
  instrument,
  onInstrument,
  chosen,
  onReset,
}: {
  instrument: Instrument;
  onInstrument: (instrument: Instrument) => void;
  /** Wie viele Akkorde eine andere als die erste Variante tragen. */
  chosen: number;
  onReset: () => void;
}) {
  return (
    <div className="mt-2 flex flex-col items-center gap-4">
      <Segmented
        label="Instrument"
        value={instrument}
        onChange={onInstrument}
        options={[
          { value: 'guitar', label: 'Gitarre' },
          { value: 'piano', label: 'Klavier' },
        ]}
      />
      {chosen > 0 && (
        <Button variant="ghost" size="sm" onClick={onReset}>
          <RotateCcw size={13} />
          {chosen === 1
            ? 'Gewählten Griff zurücksetzen'
            : `${chosen} gewählte Griffe zurücksetzen`}
        </Button>
      )}
    </div>
  );
}
