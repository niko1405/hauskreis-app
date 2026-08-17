/**
 * Setzt die Farbwahl, bevor irgendetwas gezeichnet wird.
 *
 * Nötig, weil die App als statischer Export ausgeliefert wird: Im HTML, das
 * vom Rand kommt, steht kein `data-theme` — es kann dort nicht stehen, denn
 * die Datei ist für alle dieselbe. Ohne dieses Skript blitzte bei jedem Start
 * eine Bildschirmseite lang die helle Fassung auf, und zwar besonders
 * deutlich bei dem, der ausdrücklich dunkel gewählt hat.
 *
 * Steht deshalb als **erstes Kind von `<body>`**: Der Browser arbeitet es ab,
 * bevor er den Rest des Dokuments überhaupt gelesen hat, also lange vor dem
 * ersten Bild. Aus demselben Grund lädt es nichts nach — dieselbe Überlegung
 * wie beim `boot-watchdog.tsx`.
 *
 * Es dupliziert bewusst die Logik aus `lib/theme.ts`. Sie zu importieren hieße
 * zu warten, bis React lebt, und genau darauf können wir hier nicht warten.
 * Wer die eine Seite ändert, ändert die andere mit.
 */
import { THEME_STORAGE_KEY } from '@/lib/theme-storage';

const SCRIPT = `(function () {
  try {
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    var dark = stored === 'dark' || (stored !== 'light' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  } catch (error) {
    document.documentElement.dataset.theme = 'light';
  }
})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
