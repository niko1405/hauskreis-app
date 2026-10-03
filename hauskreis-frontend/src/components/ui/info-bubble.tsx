'use client';

/**
 * Ein Info-Symbol, hinter dem eine Erklärung in einer Sprechblase steht.
 *
 * Der Anlass sind die Haken unter „Deine Angaben": Unter jedem stand ein Satz,
 * der erklärt, was er bewirkt — vier Haken, vier Absätze Kleingedrucktes, und
 * die Karte bestand mehr aus Erklärung als aus Angaben. Gebraucht wird die
 * Erklärung einmal, beim ersten Ankreuzen; danach liest man an ihr vorbei.
 *
 * **Eine Blase am Symbol, kein Sheet.** Ein Bottom-Sheet beantwortet „wähle
 * etwas aus" (dieselbe Überlegung wie bei der Glocke) und schöbe sich für zwei
 * Sätze über den halben Bildschirm. Die Blase klappt dort auf, wo man getippt
 * hat, und geht mit dem nächsten Tipp daneben wieder zu — sie verlangt keine
 * Entscheidung, also auch keinen Knopf zum Schließen.
 *
 * Gerechnet wird von der **rechten Kante** des Symbols, wie bei der Glocke:
 * Das Symbol steht am Zeilenende, und eine Blase, die nach rechts aufginge,
 * liefe aus dem Bildschirm.
 */
import { AnimatePresence, motion } from 'motion/react';
import { Info } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { IconButton } from './button';

export function InfoBubble({
  label,
  children,
}: {
  /** Wozu die Erklärung gehört — für Vorleser, die das Symbol nicht sehen. */
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;

    // `pointerdown` und nicht `click`: Ein Tipp auf einen anderen Haken soll
    // die Blase schließen *und* den Haken setzen, nicht erst nur schließen.
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
    // Die negativen Ränder ziehen den runden Knopf an die erste Textzeile und
    // an die Kante der Zeile — sichtbar ist nur das Symbol, getroffen werden
    // soll trotzdem die volle Fläche.
    <div ref={root} className="relative -my-2 -mr-2 shrink-0">
      <IconButton
        label={`Mehr zu „${label}"`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className={open ? 'text-terracotta-600' : 'text-stone-400'}
      >
        <Info size={16} />
      </IconButton>

      <AnimatePresence>
        {open && (
          <motion.div
            id={id}
            role="note"
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            style={{ transformOrigin: 'top right' }}
            className="absolute top-full right-0 z-20 mt-1 w-[min(16rem,calc(100vw-3rem))] rounded-lg border border-line bg-card px-3.5 py-3 text-xs leading-relaxed text-stone-600 shadow-xl shadow-black/15"
          >
            {/* Der Zipfel zeigt auf die Mitte des Symbols: 1,125 rem ist die
                halbe Breite des Knopfs, abzüglich der halben des Quadrats. */}
            <span
              aria-hidden
              className="absolute -top-1.5 right-[0.75rem] size-3 rotate-45 rounded-tl-[3px] border-t border-l border-line bg-card"
            />
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
