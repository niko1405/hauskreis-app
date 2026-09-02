'use client';

/**
 * Was gerade ungespeichert im Formular steht.
 *
 * Der Anlass ist das Profil: `dirty` kannte es längst, schaltete damit aber nur
 * den Speichern-Knopf frei. Ein Tipp auf die Tab-Leiste war danach weg, ohne
 * dass irgendetwas gefragt hätte — es gab im ganzen Frontend keinen
 * Navigationsschutz.
 *
 * **Ein Zähler und kein Schalter**, aus demselben Grund wie bei
 * `overlay-lock.ts`: Im Profil stehen zwei Formulare nebeneinander („Deine
 * Angaben" und „Wo du wohnst"). Ein gemeinsames Ja/Nein wäre gelöscht, sobald
 * das eine sauber wird, während das andere noch etwas offen hat.
 *
 * **Ein Modul und kein Provider**, ebenfalls wie dort: Der einzige Leser ist
 * `link.tsx`, und ein Kontext über der ganzen App, damit ein Link eine Zahl
 * erfährt, wäre eine Ebene für ein Ja/Nein.
 */
import { useEffect, useSyncExternalStore } from 'react';

let open = 0;

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * Die Rückfrage des Browsers beim Neuladen und Schließen.
 *
 * Sie ist der eine Weg hinaus, den ein Link-Handler nie sieht. Der Text kommt
 * vom Browser und lässt sich nicht setzen — dass es überhaupt fragt, ist alles,
 * was hier zu holen ist.
 */
function warnOnUnload(event: BeforeUnloadEvent): void {
  event.preventDefault();
}

/**
 * Meldet ein Formular an und gibt seine Rücknahme zurück.
 *
 * Gegen den zweiten Aufruf gesichert: React montiert Effekte im Strict Mode
 * doppelt, und ein Zähler, der einmal zu weit nach unten läuft, gibt den Weg
 * frei, während noch etwas offen ist.
 */
export function markUnsaved(): () => void {
  if (open === 0) {
    window.addEventListener('beforeunload', warnOnUnload);
  }

  open += 1;
  emit();

  let released = false;

  return () => {
    if (released) return;
    released = true;

    open -= 1;

    if (open === 0) {
      window.removeEventListener('beforeunload', warnOnUnload);
    }

    emit();
  };
}

/**
 * Solange `dirty` gilt, fragt jeder Link nach, bevor er wegführt.
 *
 * Eine Zeile im Formular, mehr ist es nicht — die Bedingung steht dort ohnehin
 * schon am Speichern-Knopf.
 */
export function useUnsavedGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    return markUnsaved();
  }, [dirty]);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Ob gerade irgendwo etwas offen ist.
 *
 * Der Server-Schnappschuss ist `false`: Beim Rendern auf dem Server hat niemand
 * etwas getippt, und ein anderer Wert wäre ein Unterschied zwischen Server und
 * Browser, den React beim Angleichen bemängelt.
 */
export function useHasUnsaved(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open > 0,
    () => false,
  );
}
