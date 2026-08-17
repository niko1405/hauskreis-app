'use client';

/**
 * Was man von der neuesten Fassung schon mitbekommen hat.
 *
 * **Zwei Zustände, nicht einer** — und der Unterschied ist der ganze Punkt:
 *
 * | gemerkt      | wird gesetzt durch      | wirkt auf                   |
 * | ------------ | ----------------------- | --------------------------- |
 * | `seen`       | „Neu in Acts2" öffnen   | den Punkt **und** den Hinweis |
 * | `dismissed`  | „Später" im Hinweis     | nur den Hinweis             |
 *
 * Vorher tat „Später" dasselbe wie das Öffnen. Für einen Hinweis, den man
 * wegschiebt, ist das richtig; für einen Punkt, der „hier gibt es etwas Neues"
 * bedeutet, wäre es falsch — wer wegschiebt, hat nichts gelesen, und der Punkt
 * wäre trotzdem weg.
 *
 * Beides im Gerät und nicht am Konto — dieselbe Überlegung wie beim Farbmodus
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

const SEEN_KEY = 'acts2-seen-release';
const DISMISSED_KEY = 'acts2-dismissed-release';

const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // Privater Modus, gesperrter Speicher — dann eben jedes Mal.
    return null;
  }
}

function write(key: string, version: string): void {
  try {
    localStorage.setItem(key, version);
  } catch {
    // Nicht merken zu können heißt nicht, nicht wegklicken zu können — für
    // diese Sitzung ist es weg.
  }
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);

  // Ein zweiter Tab derselben App hat vielleicht gerade „Neu in Acts2"
  // geöffnet. Dann soll der Punkt hier ebenfalls verschwinden, ohne dass man
  // neu lädt — wie beim Farbmodus.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== SEEN_KEY && event.key !== DISMISSED_KEY) return;
    onChange();
  };
  window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * `null` als Server-Wert: Die Seiten werden zur Bauzeit vorgerendert, dort gibt
 * es keinen `localStorage`. Punkt und Hinweis blitzen dadurch beim ersten
 * Rendern nicht auf, sondern erscheinen erst, wenn feststeht, dass sie sollen.
 */
export function useSeenRelease(): {
  seen: string | null;
  markSeen: (version: string) => void;
} {
  const seen = useSyncExternalStore(
    subscribe,
    () => read(SEEN_KEY),
    () => null,
  );

  const markSeen = useCallback(
    (version: string) => write(SEEN_KEY, version),
    [],
  );

  return { seen, markSeen };
}

export function useDismissedRelease(): {
  dismissed: string | null;
  markDismissed: (version: string) => void;
} {
  const dismissed = useSyncExternalStore(
    subscribe,
    () => read(DISMISSED_KEY),
    () => null,
  );

  const markDismissed = useCallback(
    (version: string) => write(DISMISSED_KEY, version),
    [],
  );

  return { dismissed, markDismissed };
}
