'use client';

/**
 * Der runde „+"-Knopf unten rechts — „Neues Thema", „Neues Lied".
 *
 * Er ersetzt einen Knopf über der Liste, der mit ihr wegscrollte: Wer weit
 * unten angekommen war, musste zurück nach oben, um etwas anzulegen. Jetzt
 * bleibt er stehen, wo der Daumen ist.
 *
 * **Warum ein Anker im Gerüst.** Er soll über der Leiste unten schweben,
 * welche es auch gerade ist — Tab-Leiste, Antwort-Balken oder, am Rechner,
 * keine. Mit `fixed` müsste er deren Höhe kennen und dazu die Geometrie der
 * Spalte nachbauen, die ab `md` zentriert neben der Seitenspalte steht. Im
 * Fuß des Gerüsts (`app-shell.tsx`) sitzt deshalb ein Anker direkt über der
 * Leiste, und der Knopf wird dorthin portiert, wie `BottomSlot` es tut.
 *
 * **Rechts.** Er stand zuerst links, damit er nicht dort liegt, wo der Daumen
 * den letzten Tab sucht. Aber er schwebt über der Leiste und nicht auf ihr,
 * und rechts unten ist die Stelle, an der man einen solchen Knopf erwartet —
 * links musste man ihn suchen.
 *
 * Bei offener Tastatur geht er weg, wie die Tab-Leiste — er schwebte sonst über
 * den Treffern der Suche.
 */
import { createContext, useContext, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { PRESSABLE } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { useKeyboardOpen } from '@/lib/use-keyboard-open';

interface Anchor {
  target: HTMLElement | null;
  setTarget: (element: HTMLElement | null) => void;
}

const Context = createContext<Anchor | null>(null);

export function FloatingActionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const value = useMemo(() => ({ target, setTarget }), [target]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/**
 * Der Platz über der Leiste unten. `pointer-events-none`, damit der leere
 * Kasten nichts abfängt; der Knopf darin schaltet sie für sich wieder an.
 */
export function FloatingActionAnchor() {
  const anchor = useContext(Context);

  return (
    <div
      ref={anchor?.setTarget}
      className="pointer-events-none absolute right-5 bottom-full mb-4"
    />
  );
}

export function FloatingAction({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  const anchor = useContext(Context);
  const keyboard = useKeyboardOpen();

  if (!anchor?.target) return null;

  return createPortal(
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      inert={keyboard}
      className={cn(
        'pointer-events-auto flex size-14 items-center justify-center rounded-full bg-terracotta-500 text-white shadow-lg shadow-black/20 transition-[translate,opacity,background-color] duration-200 hover:bg-terracotta-700',
        'focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas focus-visible:outline-none',
        PRESSABLE,
        keyboard && 'pointer-events-none translate-y-4 opacity-0',
      )}
    >
      {icon}
    </button>,
    anchor.target,
  );
}
