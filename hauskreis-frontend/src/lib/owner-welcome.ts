'use client';

/**
 * Der Willkommens-Hinweis nach dem Gründen — ein **Einmal-Merker**.
 *
 * **Warum nicht `useLocalFlag`.** Der kann nur gesetzt und nie zurückgenommen
 * werden („Zurückgenommen wird er nie — dafür gibt es keinen Anlass", steht
 * dort), und er beantwortet die Frage „schon gesehen?". Hier ist es andersherum:
 * Ein Ereignis stellt ihn scharf, das Anzeigen verbraucht ihn. Beides in
 * dieselbe Bauart zu zwängen hieße, zwei Merker zu führen — „soll noch" und
 * „schon gehabt" — und beim Lesen zu raten, welcher gemeint ist.
 *
 * **Warum überhaupt gespeichert und nicht bloß im Zustand.** Zwischen dem
 * Gründen und dem Ankommen auf „Heute" liegt ein Seitenwechsel; und wer die App
 * dazwischen zuklappt, soll den Hinweis trotzdem bekommen. Er steht im Gerät,
 * auf dem gegründet wurde — dort und nur dort ist er die Antwort auf „und was
 * jetzt?".
 */
import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'acts2-owner-welcome';

const listeners = new Set<() => void>();

function announce(): void {
  for (const listener of listeners) listener();
}

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    // Privater Modus, gesperrter Speicher — dann eben nicht.
    return false;
  }
}

/** Beim Gründen zu rufen. */
export function armOwnerWelcome(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // Nicht merken zu können heißt nur: kein Hinweis. Kein Grund für einen
    // Fehler in einem Ablauf, der gerade gut ausgegangen ist.
  }
  announce();
}

export function useOwnerWelcome(): { open: boolean; dismiss: () => void } {
  const subscribe = useCallback((onChange: () => void) => {
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  // Serverwert `false`: Die Seiten werden zur Bauzeit vorgerendert, dort gibt
  // es keinen `localStorage`. Ein Sheet, das beim ersten Rendern aufblitzt und
  // wieder verschwindet, wäre schlimmer als eines einen Wimpernschlag später.
  const open = useSyncExternalStore(subscribe, read, () => false);

  const dismiss = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // Siehe oben — dann ist er für diese Sitzung weg und kommt beim nächsten
      // Start noch einmal. Zweimal ist besser als gar nicht.
    }
    announce();
  }, []);

  return { open, dismiss };
}
