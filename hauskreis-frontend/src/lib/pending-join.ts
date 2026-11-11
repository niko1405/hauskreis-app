'use client';

/**
 * Der Code aus einem Einladungslink, während man sich anmeldet.
 *
 * **Warum gespeichert.** Zwischen dem Öffnen des Links und dem Beitreten liegt
 * oft ein Umweg: Keycloak, vielleicht Google, vielleicht eine Bestätigungsmail.
 * Der Rückweg trägt den Pfad im OIDC-`state` — aber nicht immer: Wer die Mail
 * in einem anderen Tab öffnet, kommt über „Zurück zu Acts2" auf die Startseite,
 * und der Link wäre vergessen. Hier steht er bis zum Beitreten.
 *
 * **Warum nicht in der Adresse.** Der Code steht im Link hinter dem `#` und
 * wird von dort gleich hierher umgezogen: Was in der Adresszeile steht, landet
 * in der Historie, in Screenshots und beim nächsten Teilen.
 *
 * Wie `owner-welcome.ts` ein Merker, den ein Ereignis setzt und ein anderes
 * verbraucht — das Beitreten oder ein „Abbrechen". Nach dreißig Tagen gilt er
 * als vergessen; der Link selbst läuft ohnehin vorher ab.
 */
import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'acts2-pending-join';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const listeners = new Set<() => void>();

function announce(): void {
  for (const listener of listeners) listener();
}

/** Nur, was wie ein Code aussieht — ein Fragment kann alles Mögliche sein. */
const CODE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/** Liest den Code aus `#…` der aktuellen Adresse, falls einer dasteht. */
export function codeFromHash(hash: string): string | null {
  const code = decodeURIComponent(hash.replace(/^#/, '')).trim();
  return CODE_PATTERN.test(code) ? code : null;
}

function read(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { code, savedAt } = JSON.parse(raw) as {
      code?: unknown;
      savedAt?: unknown;
    };
    if (typeof code !== 'string' || !CODE_PATTERN.test(code)) return null;
    if (typeof savedAt !== 'number' || Date.now() - savedAt > MAX_AGE_MS) {
      return null;
    }
    return code;
  } catch {
    // Privater Modus, gesperrter Speicher, kaputter Eintrag — dann keiner.
    return null;
  }
}

export function rememberPendingJoin(code: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ code, savedAt: Date.now() }));
  } catch {
    // Nicht merken zu können heißt nur: Der Rückweg über den OIDC-`state`
    // muss reichen. Meistens tut er das.
  }
  announce();
}

export function forgetPendingJoin(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Dann eben nicht — er läuft nach dreißig Tagen von selbst aus.
  }
  announce();
}

/** Der gemerkte Code, oder `null`. Beim Vorrendern immer `null`. */
export function usePendingJoin(): string | null {
  const subscribe = useCallback((onChange: () => void) => {
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  return useSyncExternalStore(subscribe, read, () => null);
}
