'use client';

/**
 * Das (i) neben einer Überschrift — die Erklärung, die nicht jede:r braucht.
 *
 * **Das Nötige steht da, die Einzelheiten liegen dahinter.** Die Verwaltung
 * war über die Runden zu einer Seite aus Absätzen geworden: Unter jedem
 * Schalter stand, was er tut, warum, und was er nicht tut. Wer die Seite zum
 * zweiten Mal öffnet, liest davon nichts mehr — und wer sie zum ersten Mal
 * öffnet, findet zwischen den Absätzen die Felder nicht.
 *
 * **Ein Tipp, kein Überfahren.** Ein Tooltip, der beim Hovern erscheint, gibt
 * es auf dem Telefon nicht; hier öffnet ein Druck die Blase, ein zweiter, ein
 * Tipp daneben oder Escape schließt sie.
 *
 * **Neben einem Kästchen, nicht in dessen `<label>`** (`CheckRow`): Ein Tipp
 * in die Blase hakte dort sonst nebenbei das Kästchen an. In einem Feld
 * (`Field`) darf sie im Label stehen — dort setzt derselbe Tipp nur den Fokus
 * ins Eingabefeld darunter, und der Knopf selbst fängt seinen Klick ab.
 *
 * **Die Blase bleibt im Bild.** Sie hängt am (i), wird aber beim Öffnen so
 * weit verschoben, dass sie in den Rahmen passt, in dem sie steht — die Seite
 * (`<main>` schneidet seitlich ab) oder ein Sheet. Ein (i) am rechten Rand
 * einer Zeile ließe sie sonst halb hinter der Kante verschwinden.
 */
import { Info } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

/** So breit ist die Blase höchstens — schmaler nur, wenn der Rahmen es verlangt. */
const WIDTH = 288;
/** Abstand zum Rand des Rahmens. */
const MARGIN = 12;

export function InfoTip({
  label,
  children,
}: {
  /** Wozu die Erklärung gehört — für Screenreader („Mehr zu …"). */
  label?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState({ left: 0, width: WIDTH });
  const root = useRef<HTMLSpanElement>(null);
  const id = useId();

  /** Wohin die Blase gehört, gemessen im Moment des Öffnens. */
  const measure = () => {
    const anchor = root.current;
    if (!anchor) return;

    const box = anchor.getBoundingClientRect();
    const frame = anchor
      .closest('[role="dialog"], main')
      ?.getBoundingClientRect();
    const from = Math.max(frame?.left ?? 0, 0) + MARGIN;
    const to =
      Math.min(frame?.right ?? window.innerWidth, window.innerWidth) - MARGIN;

    const width = Math.min(WIDTH, to - from);
    const left = Math.min(Math.max(box.left - 4, from), to - width);
    setPlace({ left: left - box.left, width });
  };

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <span ref={root} className="relative inline-flex shrink-0 align-middle">
      <button
        type="button"
        aria-label={label ? `Mehr zu „${label}"` : 'Mehr dazu'}
        aria-expanded={open}
        aria-controls={id}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!open) measure();
          setOpen(!open);
        }}
        className={cn(
          '-m-1 flex size-6 items-center justify-center rounded-full transition-colors',
          'focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none',
          open ? 'text-terracotta-500' : 'text-stone-400 hover:text-stone-600',
        )}
      >
        <Info size={14} strokeWidth={2.2} />
      </button>

      {open && (
        <span
          id={id}
          role="note"
          style={place}
          className={cn(
            'absolute top-full z-30 mt-2 block cursor-auto rounded-md border border-line bg-card p-3 text-left shadow-lg shadow-black/10',
            // Die Blase steht in Überschriften mit Großbuchstaben und
            // Sperrung — sie soll trotzdem wie ein Satz aussehen.
            'text-[11px] leading-relaxed font-normal tracking-normal whitespace-normal text-stone-600 normal-case',
          )}
        >
          {children}
        </span>
      )}
    </span>
  );
}
