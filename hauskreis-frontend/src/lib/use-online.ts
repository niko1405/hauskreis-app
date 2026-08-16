'use client';

import { useEffect, useState } from 'react';

/**
 * Ob das Gerät gerade Netz hat.
 *
 * Beginnt bewusst mit `true` und korrigiert sich erst im Effekt: Die Seiten
 * werden zur Bauzeit vorgerendert, und dort gibt es keinen `navigator`. Ein
 * Startwert aus dem Browser gäbe eine Hydratisierungs-Abweichung — und
 * ausgerechnet auf einem Bildschirm, der bei Fehlern helfen soll.
 *
 * `navigator.onLine` ist eine schwache Aussage: `false` heißt zuverlässig „kein
 * Netz", `true` heißt nur „irgendeine Schnittstelle ist oben". Genau so wird es
 * hier benutzt — wir schließen aus `false`, nie aus `true`.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();

    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
}
