/**
 * Die Seite, die der Service Worker ausliefert, wenn eine Navigation ohne Netz
 * ins Leere läuft und auch nichts im Zwischenspeicher liegt.
 *
 * **Warum ein String und keine Datei.** Der naheliegende Weg wäre eine
 * `public/offline.html` im Precache — genau der hat zuletzt den Worker
 * lahmgelegt: Ein Precache installiert ganz oder gar nicht, und ein Eintrag,
 * der 404 liefert, nimmt alles mit (siehe `next.config.mjs`). Dazu kommt, dass
 * Cloudflare Pages `/offline.html` mit 308 auf `/offline` umleitet — der
 * Eintrag müsste also über eine Weiterleitung geladen werden. Ein String im
 * Bündel des Workers kann dagegen nicht fehlen, nicht 404 liefern und nicht
 * umgeleitet werden.
 *
 * Alles steht inline: Der Fall, in dem diese Seite gebraucht wird, ist genau
 * der, in dem nichts nachgeladen werden kann. Aus demselben Grund arbeitet
 * `boot-watchdog.tsx` mit Inline-Styles — dieselbe Überlegung, ein anderer
 * Fehlerfall.
 *
 * Die Farben sind von Hand aus den Tokens abgeschrieben (`globals.css`), weil
 * das Stylesheet hier nicht gilt; `prefers-color-scheme` deckt den
 * Dunkelmodus ab. Wer die Palette ändert, ändert sie auch hier.
 *
 * Zwei Zeichen sind im Text unten verboten, weil sie das Template beenden
 * beziehungsweise interpoliert würden: der Backtick und die Folge `${`.
 */
export const OFFLINE_PAGE = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Keine Verbindung — Acts2</title>
<style>
  :root {
    color-scheme: light;
    --bg: #f5efe9;
    --card: #fffdfb;
    --line: #f0e5de;
    --ink: #292524;
    --ink-soft: #78716c;
    --accent: #cc7a5e;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      color-scheme: dark;
      --bg: #1c1917;
      --card: #262220;
      --line: #3a3330;
      --ink: #f5efe9;
      --ink-soft: #a8a29e;
      --accent: #d98d70;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    background: var(--bg);
    color: var(--ink);
    font-family: system-ui, -apple-system, sans-serif;
    -webkit-tap-highlight-color: transparent;
  }
  main {
    max-width: 22rem;
    width: 100%;
    text-align: center;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 28px;
    padding: 2.5rem 1.75rem;
  }
  svg { color: var(--ink-soft); }
  h1 { font-size: 1.25rem; margin: 1rem 0 0.5rem; font-weight: 700; }
  p { font-size: 0.875rem; line-height: 1.6; color: var(--ink-soft); margin: 0 0 1.75rem; }
  button {
    border: none;
    border-radius: 9999px;
    padding: 0.75rem 1.75rem;
    background: var(--accent);
    color: #fff;
    font: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }
</style>
</head>
<body>
<main>
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
    <path d="M2 2l20 20"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/>
    <path d="M5 12.9a10 10 0 0 1 5.2-2.7"/><path d="M19 12.9a10 10 0 0 0-4-2.5"/>
    <path d="M2 8.8a17 17 0 0 1 5-3.2"/><path d="M22 8.8a17 17 0 0 0-9.9-3.7"/>
    <path d="M12 20h.01"/>
  </svg>
  <h1>Keine Verbindung</h1>
  <p>Acts2 holt Termine, Themen und Lieder vom Server — dafür braucht es Internet. Sobald du wieder online bist, geht es hier von selbst weiter.</p>
  <button type="button" onclick="location.reload()">Erneut versuchen</button>
</main>
<script>
  // Von selbst weiter, sobald das Netz zurück ist. Serwists reloadOnOnline
  // greift hier nicht: das ist eine Seite des Workers, keine von Next.
  addEventListener('online', function () { location.reload(); });
</script>
</body>
</html>`;
