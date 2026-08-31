'use client';

/**
 * Das Bottom-Sheet aus dem Entwurf, allgemein gemacht — plus das, was dort
 * fehlte: Escape schließt, der Hintergrund scrollt nicht mit, der Fokus
 * landet im Sheet und nicht dahinter, und der Griff oben tut etwas.
 *
 * **Der Griff war lange nur ein Strich.** Er steht seit dem ersten Entwurf da
 * und heißt in jeder App „zieh mich weg" — hier hing kein einziger Handler
 * daran. Wer zog, bei dem passierte nichts; schließen ging nur über das X in
 * der Ecke. Ein Zeichen, das ein Versprechen gibt und es nicht einlöst, ist
 * schlimmer als keins.
 *
 * **Gezogen wird am Kopf, nicht am Körper.** Der Körper ist ein Scroller, und
 * in einem Fall (`image-cropper.tsx`) steckt darin `react-easy-crop` mit
 * eigenem Schieben und Zoomen samt Bereichsregler. Zwei Gesten auf derselben
 * Fläche brauchen eine Regel, welche gewinnt — und die hieße „nur wenn ganz
 * oben gescrollt ist", also eine, die je nach Scrollstand etwas anderes tut.
 * Am Kopf gibt es die Frage nicht: Griff und Titelzeile sind der Ziehbereich,
 * alles darunter bleibt reines Scrollen.
 *
 * Deshalb `dragListener={false}` und eine `useDragControls` — das Panel selbst
 * hört nicht zu, es wird von oben angestoßen.
 */
import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { IconButton } from './button';
import { lockOverlay } from './overlay-lock';
import { dismissed } from './swipe';

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /**
   * Die Knöpfe, die die Entscheidung tragen. Sie stehen außerhalb des
   * scrollenden Bereichs: bei einem langen Text sonst unter dem Rand — man
   * müsste erst scrollen, um abbrechen zu können.
   */
  footer?: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const drag = useDragControls();

  // `onClose` über eine Ref und **nicht** über die Abhängigkeiten: der Effekt
  // zieht den Fokus ins Panel, und er lief bisher jedes Mal neu, wenn der
  // Aufrufer einen frischen Pfeil übergab. Die meisten tun das — ein `close`,
  // das erst Felder leert und dann schließt, entsteht bei jedem Render neu.
  // Also sprang der Fokus bei **jedem getippten Buchstaben** vom Eingabefeld
  // weg. Nicht bei den Aufrufern reparieren: das wären zwölf `useCallback` für
  // einen Fehler, und der dreizehnte vergisst es.
  const latestClose = useRef(onClose);

  // Vor dem Effekt darunter, weil Effekte in der Reihenfolge ihrer Deklaration
  // laufen: bis Escape gedrückt wird, steht hier längst der aktuelle Wert.
  useEffect(() => {
    latestClose.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') latestClose.current();
    };
    document.addEventListener('keydown', onKeyDown);

    // Der Hintergrund scrollt nicht mit — und „Ziehen zum Aktualisieren" hört
    // nicht mehr zu, solange das hier oben liegt. Beides steckt in derselben
    // Anmeldung, weil es dieselbe Aussage ist (`overlay-lock.ts`). Das deckt
    // zugleich die Zieh-Geste ab: Der Wisch im Sheet erreicht die Seite
    // dahinter, denn hier wird ohne Portal gerendert.
    const release = lockOverlay();
    panel.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      release();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            ref={panel}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            drag="y"
            // Nur die Steuerung oben startet die Geste — siehe oben.
            dragListener={false}
            dragControls={drag}
            // Nach oben ist Schluss, und zwar hart: Ein Sheet, das sich über
            // seine Höhe hinaus hochziehen lässt, gibt den Rand darunter frei.
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0 }}
            // Reicht der Zug nicht, federt es zurück an seinen Platz.
            dragSnapToOrigin
            onDragEnd={(_, info) => {
              if (dismissed(info)) onClose();
            }}
            className="relative z-10 mx-auto flex max-h-[85vh] w-full max-w-md flex-col rounded-t-sheet border-t border-line bg-canvas p-6 pb-10 shadow-2xl outline-none"
          >
            {/* Der Ziehbereich: Griff und Titelzeile. `touch-none`, damit der
                Browser hier nicht stattdessen zu scrollen versucht — und nur
                hier, der Körper darunter behält sein gewöhnliches Verhalten. */}
            <div
              onPointerDown={(event) => drag.start(event)}
              className="shrink-0 cursor-grab touch-none active:cursor-grabbing"
            >
              <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-line-strong" />

              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-serif text-2xl leading-tight font-bold text-stone-900">
                    {title}
                  </h2>
                  {subtitle && (
                    <p className="mt-0.5 text-xs font-medium text-stone-400">
                      {subtitle}
                    </p>
                  )}
                </div>
                {/* Hält den Zeiger an: Ohne das begänne jeder Druck aufs X
                    eine Geste, und der Knopf wäre nur noch mit ruhiger Hand
                    zu treffen. */}
                <IconButton
                  label="Schließen"
                  onClick={onClose}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="bg-card shadow-sm"
                >
                  <X size={18} />
                </IconButton>
              </div>
            </div>

            {/* `overscroll-contain`: am Ende der Liste soll nicht die Seite
                dahinter weiterrutschen. */}
            <div className="no-scrollbar flex-1 space-y-6 overflow-y-auto overscroll-contain">
              {children}
            </div>

            {footer && <div className="mt-6 shrink-0">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
