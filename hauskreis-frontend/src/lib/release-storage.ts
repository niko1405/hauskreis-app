'use client';

/**
 * Welche Fassung man schon gesehen hat.
 *
 * Im Gerät und nicht am Konto — dieselbe Überlegung wie beim Farbmodus
 * ([[theme-storage]]): Wer den Hinweis am Telefon weggeklickt hat, soll ihn am
 * Rechner trotzdem noch einmal sehen dürfen. Er ist ja auch dort neu.
 *
 * Verglichen wird auf Gleichheit, nicht auf „neuer als". Versionsnummern
 * sortieren zu wollen hieße, `1.10.0` gegen `1.9.0` zu stellen und dabei
 * `String`-Vergleich zu vermeiden — für einen Hinweis, der ohnehin nur die
 * neueste Fassung kennt. Steht dort etwas anderes als die aktuelle, gilt sie
 * als ungesehen.
 */
import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'acts2-seen-release';

const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    // Privater Modus, gesperrter Speicher — dann eben jedes Mal.
    return null;
  }
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function useSeenRelease(): {
  seen: string | null;
  markSeen: (version: string) => void;
} {
  /**
   * `null` als Server-Wert: Die Seiten werden zur Bauzeit vorgerendert, dort
   * gibt es keinen `localStorage`. Der Hinweis blitzt dadurch beim ersten
   * Rendern nicht auf, sondern erscheint erst, wenn feststeht, dass er soll.
   */
  const seen = useSyncExternalStore(subscribe, read, () => null);

  const markSeen = useCallback((version: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, version);
    } catch {
      // Nicht merken zu können heißt nicht, nicht wegklicken zu können —
      // für diese Sitzung ist er weg.
    }
    for (const listener of listeners) listener();
  }, []);

  return { seen, markSeen };
}
