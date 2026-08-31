'use client';

/**
 * Ob die Kopfleiste über den fünf Tabs angezeigt wird.
 *
 * **Warum es die Einstellung gibt.** Die Leiste ist ein Kompromiss: Die Leiste
 * unten ist mit fünf Zielen voll, der Gruppen-Bildschirm musste irgendwohin,
 * und die Glocke wollte einen festen Platz. Wer die Kopfbilder lieber ohne
 * etwas darüber sieht, soll sie abschalten können — der Weg zur Gruppe steht
 * dann im Profil.
 *
 * **Warum im Gerät und nicht auf dem Server**, genau wie bei `lib/theme.ts`:
 * Es ist eine Aussage über diesen Bildschirm, nicht über diese Person. Auf dem
 * Telefon mit Leiste und am Rechner ohne ist kein Widerspruch, sondern der
 * Normalfall.
 *
 * `useSyncExternalStore` und nicht `useState`: Die Einstellung wird an einer
 * Stelle geändert (im Profil) und an einer ganz anderen gelesen
 * (`useHasSmartHeader`, das über der ganzen App sitzt). Ein Kontext dafür wäre
 * ein Provider mehr um alles herum; hier reicht ein Listener-Set, wie beim
 * Thema.
 */
import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'acts2-header';

const listeners = new Set<() => void>();

/**
 * Vorgabe **an**: Die Leiste ist der Normalzustand, und wer nie etwas einstellt,
 * soll die Glocke finden. Nur ein ausdrückliches `'off'` schaltet sie ab —
 * dadurch bedeutet ein fehlender oder kaputter Eintrag dasselbe wie „nie etwas
 * eingestellt".
 */
function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    // Privater Modus, gesperrter Speicher — dann eben an.
    return true;
  }
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);

  // Ein zweiter Tab derselben App hat vielleicht umgeschaltet.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onChange();
  };
  window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function useHeaderPreference(): {
  shown: boolean;
  setShown: (next: boolean) => void;
} {
  /**
   * `true` als Server-Wert: Die Seiten werden zur Bauzeit vorgerendert, dort
   * gibt es keinen `localStorage`. Wer die Leiste abgeschaltet hat, sieht sie
   * damit für einen Wimpernschlag — anders als beim Thema gibt es dafür kein
   * Inline-Skript, weil hier kein Farbsprung entstünde, sondern nur eine Leiste,
   * die verschwindet.
   */
  const shown = useSyncExternalStore(subscribe, read, () => true);

  const setShown = useCallback((next: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
    } catch {
      // Nicht speichern zu können heißt nicht, nicht umschalten zu können.
    }
    for (const listener of listeners) listener();
  }, []);

  return { shown, setShown };
}
