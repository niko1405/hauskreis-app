'use client';

/**
 * „Eine Datei der App kam nicht an" — und was man dagegen tun kann.
 *
 * Zwei Ursachen, dieselbe Behandlung:
 *
 * - Die Verbindung brach mitten im Nachladen ab. Next lädt den Code einer
 *   Seite erst beim Hingehen; ein Handy im Funkloch trifft das mitten drin.
 * - Es wurde eine neue Fassung ausgeliefert, und ein offener Tab fragt noch
 *   nach den Dateinamen der alten. Nach jedem Deploy für ein paar Minuten.
 *
 * **`reset()` aus Next.js hilft dagegen nicht.** Der gescheiterte Chunk bleibt
 * im Modul-Cache des Browsers als gescheitert stehen; ein erneutes Rendern
 * läuft in genau denselben Fehler. Nur ein vollständiges Neuladen holt die
 * Datei wirklich noch einmal.
 */

/**
 * Turbopack und webpack werfen beide einen Fehler namens `ChunkLoadError`.
 * Der Text wird zusätzlich geprüft, weil der Name auf dem Weg durch React
 * schon einmal verloren gegangen ist.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'ChunkLoadError') return true;

  return /loading chunk|failed to load chunk|dynamically imported module/i.test(
    error.message,
  );
}

const RELOAD_KEY = 'hauskreis:chunk-reload-at';
/**
 * Wie lange nach einem Neuladen kein zweites versucht wird.
 *
 * Ohne diese Sperre baut ein dauerhaft kaputtes Netz eine Neulade-Schleife:
 * Chunk fehlt → neu laden → Chunk fehlt → … Das ist schlimmer als eine
 * Fehlerseite, weil man die Schleife von Hand kaum unterbrechen kann.
 */
const COOLDOWN_MS = 30_000;

/**
 * Lädt die Seite neu — aber höchstens einmal je Zeitfenster.
 *
 * Gibt `true` zurück, wenn das Neuladen angestoßen wurde. Bei `false` ist die
 * Sperre aktiv: dann gehört die Entscheidung dem Menschen, und der
 * Fehlerbildschirm bleibt mit seinem Knopf stehen.
 */
export function reloadOnceForChunkError(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < COOLDOWN_MS) return false;

    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Privater Modus ohne sessionStorage: lieber gar nicht automatisch neu
    // laden als ohne Schleifenschutz.
    return false;
  }

  window.location.reload();
  return true;
}
