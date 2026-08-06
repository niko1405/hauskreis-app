'use client';

/**
 * Lange drücken, dann erscheint etwas.
 *
 * Für Listen, durch die man scrollt und in denen an jeder Zeile zwei Ziele
 * sitzen, die man fast nie treffen will — die Liederliste im Archiv ist der
 * Fall: Stift und Papierkorb standen dauerhaft da, und der Daumen fand sie
 * zuverlässiger als die Zeile.
 *
 * Über **Pointer-Events**, nicht über Touch: dann gilt dieselbe Geste mit der
 * Maus, und wer am Rechner sitzt, muss nicht raten, wie er an die Knöpfe kommt.
 *
 * Drei Dinge, die ohne Absicht schiefgehen:
 *
 * - **Scrollen darf nicht auslösen.** Ein Finger, der sich mehr als ein paar
 *   Pixel bewegt, wollte die Liste bewegen, nicht die Zeile drücken.
 * - **`contextmenu` gehört dazu.** Android schickt beim langen Druck genau das,
 *   und ohne `preventDefault` erscheint zusätzlich das Systemmenü.
 * - **Die Textauswahl muss aus.** iOS zeigt sonst mitten in der Geste die
 *   Auswahl-Lupe über der Zeile. Dafür gibt es `selectNone` zum Anhängen.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** Kurz genug, um sich nicht wie ein Hänger anzufühlen; lang genug für einen Tipp. */
const HOLD_MS = 500;

/** Ab hier war es Scrollen, kein Drücken. */
const MOVE_TOLERANCE_PX = 10;

export function useLongPress(onLongPress: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const [pressing, setPressing] = useState(false);

  const cancel = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
    setPressing(false);
  }, []);

  // Ein laufender Timer, während die Zeile verschwindet (gelöscht, gefiltert),
  // riefe `onLongPress` auf etwas auf, das es nicht mehr gibt.
  useEffect(() => cancel, [cancel]);

  const handlers = {
    onPointerDown: (event: React.PointerEvent) => {
      // Nur die primäre Taste: ein Rechtsklick kommt gleich als `contextmenu`.
      if (event.button !== 0) return;

      origin.current = { x: event.clientX, y: event.clientY };
      setPressing(true);

      timer.current = setTimeout(() => {
        cancel();
        onLongPress();
      }, HOLD_MS);
    },
    onPointerMove: (event: React.PointerEvent) => {
      if (!origin.current) return;

      const moved =
        Math.abs(event.clientX - origin.current.x) > MOVE_TOLERANCE_PX ||
        Math.abs(event.clientY - origin.current.y) > MOVE_TOLERANCE_PX;

      if (moved) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu: (event: React.MouseEvent) => {
      // Sowohl der Rechtsklick als auch Androids langer Druck landen hier. Das
      // Systemmenü über einer Liedzeile hilft niemandem.
      event.preventDefault();
      cancel();
      onLongPress();
    },
  };

  return {
    handlers,
    /** Während des Drückens, damit iOS keine Auswahl-Lupe einblendet. */
    selectNone: pressing ? 'select-none' : '',
  };
}
