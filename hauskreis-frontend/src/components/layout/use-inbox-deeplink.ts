'use client';

/**
 * „Angetippt heißt gelesen."
 *
 * Der Service Worker kann den Eintrag nicht selbst als gelesen eintragen: Er
 * hat kein Token (siehe den Kommentar bei `pushsubscriptionchange` in `sw.ts`).
 * Also hängt er beim Antippen `gelesen=<id>` an die Ziel-Adresse, und diese
 * Zeile hier löst das ein — auch dann, wenn die App aus dem geschlossenen
 * Zustand startet, denn dann steht der Parameter in der ersten Adresse.
 *
 * **Gelesen aus `window.location` und nicht aus `useSearchParams`.** Das
 * Frontend wird als statischer Export ausgeliefert, und dort verlangt
 * `useSearchParams` eine `<Suspense>`-Hülle um **jede** Seite, die es benutzt.
 * Dieser Haken hängt im Gerüst und beträfe damit alle. Ein einmaliger
 * Nebeneffekt braucht den Hook ohnehin nicht.
 *
 * Danach wird der Parameter aus der Adresse genommen — mit `replaceState` und
 * nicht über den Router: Es ist kein Ortswechsel, es ist Aufräumen, und ein
 * Eintrag in der Verlaufsliste dafür wäre einer zu viel.
 */
import { useEffect } from 'react';
import { useMarkNotificationRead } from '@/lib/api/hooks';

const PARAM = 'gelesen';

export function useInboxDeeplink(): void {
  const markRead = useMarkNotificationRead();

  // `markRead` steht bewusst nicht in den Abhängigkeiten: Das Objekt entsteht
  // bei jedem Rendern neu, und der Effekt liefe dann in einer Schleife — jedes
  // `invalidate` erzeugt ein Rendern, jedes Rendern einen neuen Aufruf.
  const mutate = markRead.mutate;

  useEffect(() => {
    const url = new URL(window.location.href);
    const id = url.searchParams.get(PARAM);
    if (!id) return;

    url.searchParams.delete(PARAM);
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);

    mutate(id);
  }, [mutate]);
}
