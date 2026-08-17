'use client';

/**
 * Hell, dunkel oder wie das Gerät.
 *
 * Drei Zustände, nicht zwei: „System" ist die Voreinstellung und heißt, dass
 * die App abends von selbst mitwechselt. Wer ausdrücklich hell oder dunkel
 * wählt, bekommt das — auch gegen die Einstellung des Geräts.
 *
 * Die Wahl liegt in `localStorage` und nicht auf dem Server. Sie gehört zum
 * Gerät, nicht zur Person: dasselbe Konto auf dem Telefon abends dunkel und
 * am Rechner hell ist kein Widerspruch, sondern der Normalfall.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { THEME_STORAGE_KEY, type Theme } from './theme-storage';

export type { Theme };

/** Was tatsächlich auf dem Bildschirm gilt, wenn „System" gewählt ist. */
type Resolved = 'light' | 'dark';

/**
 * Die Farbe des Streifens über der App (iOS) beziehungsweise der Systemleiste
 * (Android).
 *
 * Muss zu **`--color-canvas`** passen, nicht zu `--color-shell`. Hier stand die
 * Schale, und das war der Fehler: Die Schale ist die Farbe neben der
 * Telefonspalte und erst ab `md` sichtbar — auf dem Handy grenzt der Streifen
 * an die Leinwand. Im Dunkelmodus saß dadurch `#14100d` über `#1d1815`, und
 * genau diese Kante las sich als schwarzer Balken über der App.
 *
 * Dieselben Werte stehen in `layout.tsx`; wer hier etwas ändert, ändert es
 * dort mit.
 */
const THEME_COLOR: Record<Resolved, string> = {
  light: '#faf6f3',
  dark: '#1d1815',
};

const listeners = new Set<() => void>();

function read(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // Privater Modus, gesperrter Speicher — dann eben „System".
  }
  return 'system';
}

function systemPrefers(): Resolved {
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function resolve(theme: Theme): Resolved {
  return theme === 'system' ? systemPrefers() : theme;
}

/**
 * Setzt, was der Browser sehen muss. Dasselbe tut das Inline-Skript in
 * `layout.tsx` vor dem ersten Zeichnen — wer hier etwas ändert, ändert es
 * dort mit.
 */
export function apply(theme: Theme): void {
  const resolved = resolve(theme);
  document.documentElement.dataset.theme = resolved;

  // Das Meta-Tag trägt zwei `media`-Varianten (siehe `layout.tsx`). Die
  // greifen nur, solange niemand von Hand gewählt hat; danach zählt allein
  // dieses eine ohne `media`.
  const existing = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]:not([media])',
  );
  const tag = existing ?? document.createElement('meta');
  if (!existing) {
    tag.name = 'theme-color';
    document.head.append(tag);
  }
  tag.content = THEME_COLOR[resolved];
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);

  // Bei „System" zählt auch, was das Gerät gerade macht.
  const query = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
  const onSystemChange = () => {
    if (read() === 'system') apply('system');
    onChange();
  };
  query?.addEventListener('change', onSystemChange);

  // Ein zweiter Tab derselben App hat vielleicht umgeschaltet.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    apply(read());
    onChange();
  };
  window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(onChange);
    query?.removeEventListener('change', onSystemChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function useTheme(): {
  theme: Theme;
  resolved: Resolved;
  setTheme: (next: Theme) => void;
} {
  /**
   * `'system'` als Server-Wert: Die Seiten werden zur Bauzeit vorgerendert,
   * dort gibt es weder `localStorage` noch ein Gerät, das etwas bevorzugt.
   * Sichtbar wird der Unterschied nicht — die Farben hängen am Attribut, das
   * das Inline-Skript längst gesetzt hat, nicht an diesem Wert.
   */
  const theme = useSyncExternalStore(subscribe, read, () => 'system' as Theme);

  // Das Attribut noch einmal setzen, falls der Speicher sich seit dem
  // Inline-Skript geändert hat (zweiter Tab, erste Wahl überhaupt).
  useEffect(() => {
    apply(theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Nicht speichern zu können heißt nicht, nicht umschalten zu können.
    }
    apply(next);
    for (const listener of listeners) listener();
  }, []);

  return { theme, resolved: resolve(theme), setTheme };
}
