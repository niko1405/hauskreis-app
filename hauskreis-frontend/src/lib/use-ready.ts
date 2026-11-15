'use client';

import { useState } from 'react';

/**
 * Ob alles da ist, was eine Seite zum Zeichnen braucht — und wie sie dann
 * erscheint.
 *
 * **Alles auf einmal statt Stück für Stück.** Lädt jeder Abschnitt für sich,
 * springen sie einzeln auf, und die Seite wächst unter dem Finger. Stattdessen
 * steht ein Platzhalter da, bis die letzte Antwort kommt, und dann der Inhalt
 * als Ganzes, kaum merklich von unten (`animate-panel-in`).
 *
 * War schon beim ersten Zeichnen alles da — vorgeladen oder noch im
 * Zwischenspeicher —, gibt es keine eigene Bewegung: Die Seite gleitet ohnehin
 * gerade herein.
 *
 * Ein Fehler zählt als „da": Den zeigt der Abschnitt, der ihn hat.
 */
export function useReady(queries: readonly { status: string }[]): {
  ready: boolean;
  reveal: string | undefined;
} {
  const ready = queries.every((query) => query.status !== 'pending');
  const [readyAtStart] = useState(ready);

  return { ready, reveal: readyAtStart ? undefined : 'animate-panel-in' };
}
