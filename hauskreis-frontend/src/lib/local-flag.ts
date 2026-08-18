'use client';

/**
 * Ein Ja/Nein, das im Gerät stehen bleibt.
 *
 * **Warum nicht am Konto.** Dieselbe Überlegung wie beim Farbmodus und beim
 * Release-Punkt ([[release-storage]]): Was man auf dem Telefon einmal gesehen
 * hat, hat man am Rechner noch nicht gesehen. Ein Hinweis, der beim ersten
 * Start hilft, soll bei jedem ersten Start helfen.
 *
 * **Warum getrennt von `release-storage`.** Dort steht eine *Versionsnummer*,
 * und die Frage lautet „welche zuletzt". Hier steht nichts weiter als „schon
 * passiert". Beides in eine Datei zu ziehen hieße, dem Speicher zwei Bedeutungen
 * zu geben und beim Lesen raten zu müssen, welche gemeint ist.
 *
 * Der Server-Wert ist `false`: Die Seiten werden zur Bauzeit vorgerendert, dort
 * gibt es keinen `localStorage`. Ein Punkt, der beim ersten Rendern aufblitzt
 * und wieder verschwindet, wäre schlimmer als einer, der einen Wimpernschlag
 * später kommt.
 */
import { useCallback, useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();

function read(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    // Privater Modus, gesperrter Speicher — dann eben jedes Mal.
    return false;
  }
}

function write(key: string): void {
  try {
    localStorage.setItem(key, '1');
  } catch {
    // Nicht merken zu können heißt nicht, nicht wegklicken zu können — für
    // diese Sitzung ist es weg.
  }
  for (const listener of listeners) listener();
}

/**
 * Ein Merker und der Weg, ihn zu setzen. Zurückgenommen wird er nie — dafür
 * gibt es keinen Anlass, und ein Rückweg wäre eine Zusage, die niemand braucht.
 */
export function useLocalFlag(key: string): {
  set: boolean;
  mark: () => void;
} {
  const subscribe = useCallback(
    (onChange: () => void) => {
      listeners.add(onChange);

      // Ein zweiter Tab derselben App hat den Merker vielleicht gerade
      // gesetzt. Dann soll der Punkt hier ebenfalls verschwinden, ohne dass
      // man neu lädt.
      const onStorage = (event: StorageEvent) => {
        if (event.key !== key) return;
        onChange();
      };
      window.addEventListener('storage', onStorage);

      return () => {
        listeners.delete(onChange);
        window.removeEventListener('storage', onStorage);
      };
    },
    [key],
  );

  const set = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => false,
  );

  const mark = useCallback(() => write(key), [key]);

  return { set, mark };
}
