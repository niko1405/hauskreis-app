'use client';

/**
 * Wer gerade über der Seite liegt.
 *
 * Zwei Dinge hängen daran, und beide brauchen einen **Zähler** statt eines
 * Schalters:
 *
 * 1. **Der gesperrte Hintergrund.** `Sheet` hat sich den vorigen
 *    `body.style.overflow` selbst gemerkt und ihn beim Schließen
 *    zurückgeschrieben. Das geht auf, solange in Stapel-Reihenfolge geschlossen
 *    wird — und genau das ist nicht der Normalfall: `ConfirmProvider` baut auf
 *    `Sheet`, eine Rückfrage über einem Sheet ist Alltag, und die beiden merken
 *    sich dann gegenseitig `'hidden'` als „vorherigen" Wert.
 * 2. **Ziehen zum Aktualisieren.** Der Kommentar in `pull-to-refresh.tsx` ging
 *    davon aus, eine Berührung im Sheet erreiche die Geste gar nicht. Das
 *    stimmt nicht: `Sheet` rendert ohne Portal, `position: fixed` ändert nur,
 *    wo gemalt wird, nicht, woran das Element hängt. Die Geste liegt am
 *    Seiteninhalt und bekommt jeden Wisch im Sheet mit.
 *
 * Beides ist dieselbe Frage — „liegt gerade etwas darüber" —, und sie hat
 * genau eine Antwort. Deshalb ein Modul und keine zwei.
 */
import { useSyncExternalStore } from 'react';

let open = 0;

/** Was am `body` stand, bevor das erste Overlay kam. */
let restore: string | null = null;

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * Meldet ein Overlay an und gibt seine Rücknahme zurück.
 *
 * Die Rücknahme ist gegen den zweiten Aufruf gesichert: React montiert Effekte
 * im Strict Mode doppelt, und ein Zähler, der einmal zu weit nach unten läuft,
 * gibt den Hintergrund frei, während noch etwas darüber liegt.
 */
export function lockOverlay(): () => void {
  if (open === 0) {
    restore = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }

  open += 1;
  emit();

  let released = false;

  return () => {
    if (released) return;
    released = true;

    open -= 1;

    if (open === 0) {
      document.body.style.overflow = restore ?? '';
      restore = null;
    }

    emit();
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Ob gerade eines offen ist.
 *
 * Der Server-Schnappschuss ist `false` — beim Rendern auf dem Server gibt es
 * kein Overlay, und ein anderer Wert wäre ein Unterschied zwischen Server und
 * Browser, den React beim Angleichen bemängelt.
 */
export function useOverlayOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open > 0,
    () => false,
  );
}
