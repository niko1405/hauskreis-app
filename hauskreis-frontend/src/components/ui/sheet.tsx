'use client';

/**
 * Das Bottom-Sheet aus dem Entwurf, allgemein gemacht — plus das, was dort
 * fehlte: Escape schließt, der Hintergrund scrollt nicht mit, der Fokus
 * landet im Sheet und nicht dahinter.
 */
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { IconButton } from './button';

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

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
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
            className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm"
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
            className="relative z-10 mx-auto flex max-h-[85vh] w-full max-w-md flex-col rounded-t-sheet border-t border-line bg-canvas p-6 pb-10 shadow-2xl outline-none"
          >
            <div className="mx-auto mb-5 h-1.5 w-12 shrink-0 rounded-full bg-line-strong" />

            <div className="mb-6 flex shrink-0 items-start justify-between gap-4">
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
              <IconButton
                label="Schließen"
                onClick={onClose}
                className="bg-card shadow-sm"
              >
                <X size={18} />
              </IconButton>
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
