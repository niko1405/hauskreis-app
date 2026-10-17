'use client';

/**
 * Die eigene Version im Vollbild — zum Spielen und Mitsingen.
 *
 * **Oben die Akkorde, unten das Spielen.** Über dem Blatt steht eine Karte mit
 * allen Akkorden des Lieds als Griffbild (`chord-panels.tsx`), dazu der
 * Umschalter Text/Akkorde, das Transponieren und „Anpassen" (Gitarre oder
 * Klavier). Das sind Fragen, die man einmal vor dem Lied beantwortet — sie
 * scrollen mit weg. Unten bleibt nur, was man während des Spielens braucht:
 * Schrift und Autoscroll mit seinem Tempo. Läuft der Autoscroll, tritt die
 * Leiste nach ein paar Sekunden zurück; ein Tipp aufs Blatt holt sie wieder.
 *
 * **Ein Tipp auf einen Akkord** — oben oder im Text — zeigt ihn groß, mit allen
 * Varianten zum Durchblättern. Die gewählte gilt für jede Stelle mit genau
 * diesem Akkord.
 *
 * **Was gemerkt wird, und wo.** Transposition, Tempo und die gewählten Griffe
 * hängen am Lied — ein Lied in einer anderen Tonart zu spielen ist eine
 * Aussage über dieses Lied, und ein langsames scrollt langsam. Sie stehen
 * deshalb an der eigenen Version im Gerät. Schriftgröße und Instrument hängen
 * an dem, der spielt, und gelten für alle Lieder (`localStorage`).
 *
 * **Das Display bleibt an** (`navigator.wakeLock`), solange das Vollbild offen
 * ist. Mitten im Lied geht sonst nach dreißig Sekunden das Licht aus. Wo es die
 * Schnittstelle nicht gibt, passiert still nichts — das Blatt funktioniert
 * trotzdem.
 *
 * Wie der Editor eine Ebene im Baum und kein Portal, aus demselben Grund.
 */
import {
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, IconButton, PRESSABLE } from '@/components/ui/button';
import { lockOverlay } from '@/components/ui/overlay-lock';
import { Segmented } from '@/components/ui/segmented';
import {
  ChordSheetView,
  type SheetMode,
} from '@/components/domain/chord-sheet-view';
import type { Instrument } from '@/components/domain/chord-diagram';
import { chordsOf, hasChords, transposer, type Sheet } from '@/lib/chords';
import { cn } from '@/lib/cn';
import {
  AdjustPanelContent,
  ChordDetail,
  ChordStrip,
  Panel,
  readInstrument,
  voicingKey,
  writeInstrument,
} from './chord-panels';

const SCALE_KEY = 'hauskreis-lied-schrift';
const SCALE_MIN = 0.8;
const SCALE_MAX = 2.2;
const SCALE_DEFAULT = 1.2;

const SPEED_MIN = 1;
const SPEED_MAX = 10;

/** Stufe → Pixel je Sekunde. Stufe 4 ist ein ruhiges Lied in mittlerer Schrift. */
function pixelsPerSecond(speed: number): number {
  return 3 + (speed - 1) * 4.5;
}

function readScale(): number {
  try {
    const stored = Number(window.localStorage.getItem(SCALE_KEY));
    return stored >= SCALE_MIN && stored <= SCALE_MAX ? stored : SCALE_DEFAULT;
  } catch {
    return SCALE_DEFAULT;
  }
}

function writeScale(scale: number): void {
  try {
    window.localStorage.setItem(SCALE_KEY, String(scale));
  } catch {
    // Ohne Speicher gilt die Größe eben nur für dieses Mal.
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface FullscreenSettings {
  transpose: number;
  scrollSpeed: number;
  voicings: Record<string, number>;
}

type OpenPanel = { kind: 'chord'; chord: string } | { kind: 'adjust' } | null;

export function SheetFullscreen({
  title,
  artist,
  sheet,
  transpose: initialTranspose,
  scrollSpeed: initialSpeed,
  voicings: initialVoicings,
  onSettings,
  onClose,
}: {
  title: string;
  artist: string | null;
  sheet: Sheet;
  transpose: number;
  scrollSpeed: number;
  /** Die gewählten Griffe, je `instrument:Akkord` (`voicingKey`). */
  voicings: Record<string, number>;
  /** Tonart, Tempo oder Griffe haben sich geändert — für die eigene Version merken. */
  onSettings: (settings: FullscreenSettings) => void;
  onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const chords = hasChords(sheet);

  const [mode, setMode] = useState<SheetMode>(chords ? 'chords' : 'text');
  const [transpose, setTranspose] = useState(initialTranspose);
  const [speed, setSpeed] = useState(clamp(initialSpeed, SPEED_MIN, SPEED_MAX));
  const [scale, setScale] = useState(SCALE_DEFAULT);
  const [playing, setPlaying] = useState(false);
  const [toolbar, setToolbar] = useState(true);
  const [scaleOpen, setScaleOpen] = useState(false);
  const [instrument, setInstrument] = useState<Instrument>('guitar');
  const [choices, setChoices] = useState(initialVoicings);
  const [panel, setPanel] = useState<OpenPanel>(null);

  const shift = useMemo(() => transposer(sheet, transpose), [sheet, transpose]);
  const original = useMemo(() => transposer(sheet, 0).key, [sheet]);

  /** Die Akkorde, wie sie dastehen — jeder einmal, in der Reihenfolge des Lieds. */
  const shown = useMemo(
    () => [...new Set(chordsOf(sheet).map((symbol) => shift.chord(symbol)))],
    [sheet, shift],
  );

  // Schriftgröße und Instrument erst im Browser lesen — beim ersten Rendern
  // gibt es noch keinen Speicher, aus dem sie kämen.
  useEffect(() => {
    setScale(readScale());
    setInstrument(readInstrument());
  }, []);

  // Escape nimmt zuerst zurück, was gerade offen ist, dann das Vollbild.
  const onEscape = useRef(() => {});
  useEffect(() => {
    onEscape.current = () => {
      if (panel) setPanel(null);
      else if (scaleOpen) setScaleOpen(false);
      else onClose();
    };
  });

  // Überlagerung, Escape, echtes Vollbild und Wachhalten — alles für die
  // Dauer, die das hier offen ist.
  const latestClose = useRef(onClose);
  useEffect(() => {
    latestClose.current = onClose;
  });

  useEffect(() => {
    const release = lockOverlay();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onEscape.current();
    };
    document.addEventListener('keydown', onKeyDown);

    // Das echte Vollbild gibt es auf dem iPhone nicht; dort reicht die Fläche
    // der App vom Home-Bildschirm.
    const element = root.current;
    if (element && document.fullscreenEnabled && !document.fullscreenElement) {
      element.requestFullscreen?.().catch(() => undefined);
    }

    let lock: WakeLockSentinel | null = null;
    let active = true;
    const acquire = () => {
      if (
        !('wakeLock' in navigator) ||
        document.visibilityState !== 'visible'
      ) {
        return;
      }
      navigator.wakeLock
        .request('screen')
        .then((sentinel) => {
          if (active) lock = sentinel;
          else void sentinel.release();
        })
        .catch(() => undefined);
    };
    // Die Sperre fällt beim Wechsel in eine andere App von selbst weg.
    const onVisible = () => {
      if (document.visibilityState === 'visible') acquire();
    };
    acquire();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      active = false;
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => undefined);
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => undefined);
      }
      release();
    };
  }, []);

  // Wird das Vollbild über die Geste des Systems verlassen, ist auch das hier
  // zu Ende — sonst stünde eine Ebene da, die nach Vollbild aussieht.
  useEffect(() => {
    let entered = false;
    const onChange = () => {
      if (document.fullscreenElement) entered = true;
      else if (entered) latestClose.current();
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Tonart, Tempo und Griffe merken — nicht beim ersten Rendern, da ist nichts
  // neu.
  const latestSettings = useRef(onSettings);
  useEffect(() => {
    latestSettings.current = onSettings;
  });
  const settled = useRef(false);
  useEffect(() => {
    if (!settled.current) {
      settled.current = true;
      return;
    }
    latestSettings.current({
      transpose,
      scrollSpeed: speed,
      voicings: choices,
    });
  }, [transpose, speed, choices]);

  // Der Autoscroll: Bild für Bild, mit Bruchteilen von Pixeln aufgespart,
  // damit auch die langsamste Stufe gleichmäßig läuft. Ein Finger auf dem
  // Blatt hält ihn an, solange er liegt — wer zurückscrollt, will nicht gegen
  // das Band kämpfen.
  useEffect(() => {
    const element = scroller.current;
    if (!playing || !element) return;

    let frame = 0;
    let last = performance.now();
    let saved = 0;
    let held = false;

    const hold = () => {
      held = true;
    };
    const letGo = () => {
      held = false;
      last = performance.now();
    };

    const tick = (now: number) => {
      const elapsed = now - last;
      last = now;

      if (!held) {
        saved += (pixelsPerSecond(speed) * elapsed) / 1000;
        const whole = Math.floor(saved);
        if (whole >= 1) {
          element.scrollTop += whole;
          saved -= whole;
        }
        if (
          element.scrollTop + element.clientHeight >=
          element.scrollHeight - 1
        ) {
          setPlaying(false);
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };

    element.addEventListener('touchstart', hold, { passive: true });
    element.addEventListener('touchend', letGo, { passive: true });
    element.addEventListener('touchcancel', letGo, { passive: true });
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener('touchstart', hold);
      element.removeEventListener('touchend', letGo);
      element.removeEventListener('touchcancel', letGo);
    };
  }, [playing, speed]);

  // Läuft er, tritt die Leiste nach einer Weile zurück. Steht er, bleibt sie.
  useEffect(() => {
    if (!playing || !toolbar) return;
    const timer = window.setTimeout(() => {
      setToolbar(false);
      setScaleOpen(false);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [playing, toolbar]);

  const changeScale = (delta: number) => {
    setScale((current) => {
      const next =
        Math.round(clamp(current + delta, SCALE_MIN, SCALE_MAX) * 10) / 10;
      writeScale(next);
      return next;
    });
  };

  const togglePlay = () => {
    const element = scroller.current;
    // Am Ende angekommen, beginnt ein neuer Durchlauf von vorn.
    if (
      !playing &&
      element &&
      element.scrollTop + element.clientHeight >= element.scrollHeight - 1
    ) {
      element.scrollTop = 0;
    }
    setPlaying((current) => !current);
  };

  const chooseInstrument = (next: Instrument) => {
    setInstrument(next);
    writeInstrument(next);
  };

  const prefix = `${instrument}:`;
  const chosen = Object.entries(choices).filter(
    ([key, index]) => key.startsWith(prefix) && index !== 0,
  ).length;

  const resetChoices = () =>
    setChoices((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => !key.startsWith(prefix)),
      ),
    );

  const keyLabel =
    transpose === 0 || !original
      ? (original ?? 'Tonart')
      : `${original} → ${shift.key ?? ''}`;

  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={`${title} im Vollbild`}
      className="fixed inset-0 z-50 flex flex-col bg-canvas"
    >
      {/* Ein Tipp auf das Blatt holt die Leiste zurück oder schickt sie weg.
          Kein Knopf: Die ganze Fläche ist das Ziel, und die Leiste hat ihre
          eigenen Knöpfe für alles, was man mit der Tastatur erreicht. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        ref={scroller}
        onClick={() => setToolbar((current) => !current)}
        className="flex-1 overflow-y-auto overscroll-contain"
      >
        <div className="mx-auto w-full max-w-3xl px-5 pt-safe-4 pb-[45vh]">
          <header className="mb-5 pr-12">
            <h1 className="font-serif text-2xl leading-tight font-bold text-stone-900">
              {title}
            </h1>
            {artist && (
              <p className="mt-0.5 text-sm text-stone-400">{artist}</p>
            )}
          </header>

          {chords && (
            // Die Karte ist kein Blatt: Ein Tipp darauf schaltet die Leiste
            // nicht um.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
            <section
              onClick={(event) => event.stopPropagation()}
              className="mb-6 rounded-card border border-line bg-card p-4"
            >
              <div className="flex items-center gap-2">
                <p className="mr-auto text-[11px] font-bold tracking-widest text-stone-400 uppercase">
                  Akkorde
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPanel({ kind: 'adjust' })}
                >
                  <SlidersHorizontal size={13} />
                  Anpassen
                </Button>
              </div>

              {mode === 'chords' && (
                <div className="mt-2">
                  <ChordStrip
                    chords={shown}
                    instrument={instrument}
                    notation={sheet.notation}
                    choices={choices}
                    onOpen={(chord) => setPanel({ kind: 'chord', chord })}
                  />
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Segmented
                  size="sm"
                  label="Ansicht"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: 'text', label: 'Text' },
                    { value: 'chords', label: 'Akkorde' },
                  ]}
                />
                {mode === 'chords' && (
                  <Stepper
                    label="Transponieren"
                    onDown={() => setTranspose((value) => (value - 1) % 12)}
                    onUp={() => setTranspose((value) => (value + 1) % 12)}
                  >
                    <button
                      type="button"
                      onClick={() => setTranspose(0)}
                      disabled={transpose === 0}
                      title={
                        transpose === 0
                          ? undefined
                          : 'Zurück zur Originaltonart'
                      }
                      className="flex min-w-16 items-center justify-center gap-1 px-1 text-sm font-bold text-terracotta-600 disabled:text-stone-700"
                    >
                      {keyLabel}
                      {transpose !== 0 && <RotateCcw size={12} />}
                    </button>
                  </Stepper>
                )}
              </div>
            </section>
          )}

          <ChordSheetView
            sheet={sheet}
            chord={shift.chord}
            mode={mode}
            scale={scale}
            onChord={
              chords && mode === 'chords'
                ? (chord) => setPanel({ kind: 'chord', chord })
                : undefined
            }
          />
        </div>
      </div>

      <IconButton
        label="Vollbild schließen"
        onClick={onClose}
        className={cn(
          'absolute top-[calc(env(safe-area-inset-top)+1rem)] right-4 border border-line bg-card shadow-sm transition-opacity',
          !toolbar && 'pointer-events-none opacity-0',
        )}
      >
        <X size={18} />
      </IconButton>

      {/* Unten nur, was man beim Spielen braucht: Schrift und Autoscroll. */}
      <div
        inert={!toolbar}
        className={cn(
          'pb-safe absolute inset-x-0 bottom-0 border-t border-line bg-canvas/95 backdrop-blur transition-[translate,opacity] duration-200',
          !toolbar && 'translate-y-full opacity-0',
        )}
      >
        <div className="mx-auto w-full max-w-3xl px-5 pt-2 pb-3">
          {scaleOpen && (
            <div className="mb-2 flex justify-center">
              <Stepper
                label="Schrift"
                onDown={() => changeScale(-0.1)}
                onUp={() => changeScale(0.1)}
                downLabel="Schrift kleiner"
                upLabel="Schrift größer"
              >
                <span className="min-w-12 text-center text-sm font-bold text-stone-700 tabular-nums">
                  {Math.round(scale * 100)} %
                </span>
              </Stepper>
            </div>
          )}

          <div className="grid grid-cols-[1fr_auto_1fr] items-center">
            <button
              type="button"
              aria-pressed={scaleOpen}
              aria-label="Schriftgröße"
              onClick={() => setScaleOpen((current) => !current)}
              className={cn(
                'flex size-11 items-center justify-center justify-self-start rounded-full border font-serif text-base font-bold transition-colors',
                PRESSABLE,
                scaleOpen
                  ? 'border-terracotta-500 bg-terracotta-500/10 text-terracotta-600'
                  : 'border-line bg-card text-stone-700',
              )}
            >
              Aa
            </button>

            <div className="flex flex-col items-center">
              <div className="flex items-center gap-2">
                <IconButton
                  label="Langsamer scrollen"
                  onClick={() =>
                    setSpeed((value) => clamp(value - 1, SPEED_MIN, SPEED_MAX))
                  }
                  className="border border-line bg-card"
                >
                  <Minus size={16} />
                </IconButton>
                <button
                  type="button"
                  onClick={togglePlay}
                  aria-pressed={playing}
                  aria-label={
                    playing ? 'Autoscroll anhalten' : 'Autoscroll starten'
                  }
                  className={cn(
                    'flex size-14 items-center justify-center rounded-full bg-terracotta-500 text-white shadow-sm hover:bg-terracotta-700',
                    PRESSABLE,
                  )}
                >
                  {playing ? (
                    <Pause size={22} />
                  ) : (
                    <Play size={22} className="ml-0.5" />
                  )}
                </button>
                <IconButton
                  label="Schneller scrollen"
                  onClick={() =>
                    setSpeed((value) => clamp(value + 1, SPEED_MIN, SPEED_MAX))
                  }
                  className="border border-line bg-card"
                >
                  <Plus size={16} />
                </IconButton>
              </div>
              <span className="mt-1 text-[11px] font-semibold text-stone-400 tabular-nums">
                Scrollen · Tempo {speed}
              </span>
            </div>

            <span />
          </div>
        </div>
      </div>

      {panel?.kind === 'chord' && (
        <Panel title="Akkord" onClose={() => setPanel(null)}>
          <ChordDetail
            chord={panel.chord}
            instrument={instrument}
            notation={sheet.notation}
            index={choices[voicingKey(instrument, panel.chord)] ?? 0}
            onIndex={(index) =>
              setChoices((current) => ({
                ...current,
                [voicingKey(instrument, panel.chord)]: index,
              }))
            }
          />
        </Panel>
      )}

      {panel?.kind === 'adjust' && (
        <Panel title="Anpassen" onClose={() => setPanel(null)}>
          <AdjustPanelContent
            instrument={instrument}
            onInstrument={chooseInstrument}
            chosen={chosen}
            onReset={resetChoices}
          />
        </Panel>
      )}
    </div>
  );
}

/** − Wert + — für Tonart, Schrift und Tempo dieselbe Bauform. */
function Stepper({
  label,
  onDown,
  onUp,
  downLabel = `${label} runter`,
  upLabel = `${label} hoch`,
  children,
}: {
  label: string;
  onDown: () => void;
  onUp: () => void;
  downLabel?: string;
  upLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex items-center rounded-full border border-line bg-card"
    >
      <IconButton label={downLabel} onClick={onDown}>
        <Minus size={16} />
      </IconButton>
      {children}
      <IconButton label={upLabel} onClick={onUp}>
        <Plus size={16} />
      </IconButton>
    </div>
  );
}
