/**
 * Ob der letzte Seitenwechsel ein **Zurück** war — für die Richtung, aus der
 * eine Seite hereinkommt (`app/(app)/template.tsx`).
 *
 * Next sagt das nicht. Der Browser schon: Zurück und Vor lösen `popstate` aus,
 * ein Link oder `router.push` nicht. Das gilt für die Zurück-Geste, den Knopf
 * des Browsers und den Zurück-Pfeil der App (`router.back()`) gleichermaßen.
 *
 * Gemerkt wird nur der Zeitpunkt, und als Zurück zählt der Wechsel, wenn er
 * kurz darauf ankommt. Ein `popstate` ohne neue Seite — zwischen zwei
 * Adressen, die sich nur in `?id=` unterscheiden, bleibt das Template stehen —
 * färbte sonst den nächsten gewöhnlichen Wechsel.
 */

/** Wie lange nach `popstate` ein neuer Seitenaufbau noch als Zurück gilt. */
const WINDOW_MS = 800;

let poppedAt = 0;

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    poppedAt = Date.now();
  });
}

export function wasBackNavigation(): boolean {
  return Date.now() - poppedAt < WINDOW_MS;
}
