'use client';

/**
 * Ob ein Bildschirm die Kopfleiste gerade selbst braucht.
 *
 * Der Anlass ist der Suchmodus im Archiv und auf „Termine": Wer sucht, will
 * oben das Suchfeld sehen und nicht Glocke und Gruppe darüber. Die Leiste
 * gehört aber der Hülle und nicht der Seite — die Seite kann sie nur bitten zu
 * gehen.
 *
 * **Zwei Bitten.** `suppressHeader` schickt sie ganz weg. `restrictHeaderToTop`
 * lässt sie nur ganz oben stehen: Im Archiv klebt das Suchfeld oben, sobald
 * man scrollt, und eine Leiste, die beim Hochwischen darüberführe, verdeckte
 * genau das. Ganz oben gehört sie trotzdem hin — dort steht der Weg zur Gruppe
 * und die Glocke.
 *
 * **Ein Zähler und ein Modul**, aus denselben Gründen wie `overlay-lock.ts`:
 * Die Rücknahme muss den doppelten Effekt im Strict Mode überstehen, und ein
 * Kontext über der ganzen App für ein Ja/Nein wäre eine Ebene zu viel. Der
 * einzige Leser ist `useHeaderScroll`.
 *
 * Die Rücknahme gehört in den Aufräumteil eines Effekts. Dann kommt die Leiste
 * von selbst zurück, auch wenn man mitten in der Suche den Tab wechselt — eine
 * Seite, die nicht mehr da ist, kann nichts mehr unterdrücken.
 */
import { useSyncExternalStore } from 'react';

let suppressed = 0;
let topOnly = 0;

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Schickt die Kopfleiste weg und gibt zurück, wie sie wiederkommt. */
export function suppressHeader(): () => void {
  suppressed += 1;
  emit();

  let released = false;

  return () => {
    if (released) return;
    released = true;

    suppressed -= 1;
    emit();
  };
}

/** Lässt die Kopfleiste nur ganz oben stehen und gibt zurück, wie sie es wieder darf. */
export function restrictHeaderToTop(): () => void {
  topOnly += 1;
  emit();

  let released = false;

  return () => {
    if (released) return;
    released = true;

    topOnly -= 1;
    emit();
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Ob gerade jemand darum gebeten hat. Auf dem Server nie. */
export function useHeaderSuppressed(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => suppressed > 0,
    () => false,
  );
}

/** Ob die Leiste nur ganz oben stehen soll. Auf dem Server nie. */
export function useHeaderTopOnly(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => topOnly > 0,
    () => false,
  );
}
