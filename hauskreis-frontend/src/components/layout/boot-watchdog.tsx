/**
 * Der Ausweg für den Fall, dass die App gar nicht erst anläuft.
 *
 * „Einen Moment …" kommt vom Server: `useSessionRestore` startet auf
 * `'checking'` und `auth.isLoading` ist anfangs `true`, der Text steht also
 * schon im ausgelieferten HTML. Kommt danach ein Chunk nicht an — schlechtes
 * Netz, oder ein Tab, der nach einem Deploy noch die alten Dateinamen kennt —
 * hydratisiert React nie. Dann hilft nichts von dem, was wir sonst haben:
 * `useSlow` mit seinen zwölf Sekunden liegt in genau dem JavaScript, das fehlt,
 * und eine Fehlergrenze (`error.tsx`) braucht ein laufendes React.
 *
 * Deshalb steht hier alles **im HTML selbst**: ein Inline-Skript, das nichts
 * nachlädt, und ein Kasten, der schon da ist und nur sichtbar gemacht wird.
 * Aus demselben Grund Inline-Styles wie in `global-error.tsx` — wenn
 * ausgerechnet das Stylesheet nicht ankam, wäre ein Hinweis ohne Aussehen der
 * zweite Fehler.
 *
 * Absichtlich **kein** automatisches Neuladen. `reloadOnceForChunkError` darf
 * das, weil dort React läuft und der Fehler einen Namen hat; hier weiß niemand,
 * ob ein zweiter Versuch besser ausgeht.
 */

/** Wie lange Stillstand als normal durchgeht, bevor der Kasten aufgeht. */
const TIMEOUT_MS = 10_000;

/**
 * Nach einer gescheiterten Datei nicht sofort aufmachen: manchmal fehlt etwas
 * Entbehrliches und die App kommt trotzdem hoch. Diese Gnadenfrist ist immer
 * noch um ein Vielfaches schneller als das Zeitlimit oben.
 */
const AFTER_ERROR_MS = 1_500;

const FALLBACK_ID = 'hk-boot-fallback';
const HINT_ID = 'hk-boot-hint';
const READY_ATTRIBUTE = 'data-hk-ready';

/**
 * Wird von `providers.tsx` gesetzt, sobald React lebt. Der Wachhund prüft nur
 * diese Marke — ob die App **danach** hängt, ist Sache von `useSlow`.
 */
export const BOOT_READY_ATTRIBUTE = READY_ATTRIBUTE;

const SCRIPT = `(function () {
  var shown = false;
  var timer = null;

  function ready() {
    return document.documentElement.getAttribute('${READY_ATTRIBUTE}') === '1';
  }

  function show() {
    if (shown || ready()) return;
    var box = document.getElementById('${FALLBACK_ID}');
    if (!box) return;
    shown = true;
    if (navigator.onLine === false) {
      var hint = document.getElementById('${HINT_ID}');
      if (hint) hint.textContent = 'Du bist gerade offline. Sobald du wieder Netz hast, hilft ein Neuladen.';
    }
    box.style.display = 'flex';
  }

  function showSoon() {
    if (shown || timer) return;
    timer = setTimeout(show, ${AFTER_ERROR_MS});
  }

  // In der Capture-Phase melden sich hier auch Dateien, die nicht geladen
  // werden konnten — die tauchen sonst nirgends auf.
  window.addEventListener('error', function (event) {
    var target = event.target;
    if (!target || target === window) return;
    if (target.tagName === 'SCRIPT' || target.tagName === 'LINK') showSoon();
  }, true);

  setTimeout(show, ${TIMEOUT_MS});
})();`;

const FALLBACK_HTML = `
  <div style="max-width:22rem;text-align:center">
    <h1 style="font-size:1.25rem;margin:0 0 .5rem;font-weight:700">Die App kam nicht ganz an</h1>
    <p id="${HINT_ID}" style="font-size:.875rem;line-height:1.6;color:#78716c;margin:0 0 1.5rem">
      Ein Teil der App fehlt — meistens liegt das an einer wackligen Verbindung.
    </p>
    <button type="button" onclick="location.reload()"
      style="border:none;border-radius:9999px;padding:.75rem 1.5rem;background:#cc7a5e;color:#fff;font-weight:600;font-size:.875rem;cursor:pointer">
      Neu laden
    </button>
  </div>
`;

export function BootWatchdog() {
  return (
    <>
      {/* `dangerouslySetInnerHTML` hier nicht aus Bequemlichkeit: React
          hydratisiert solche Teilbäume nicht, dadurch überlebt das
          `onclick`-Attribut am Knopf. */}
      <div
        id={FALLBACK_ID}
        style={{
          display: 'none',
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          background: '#f5efe9',
          color: '#292524',
          fontFamily: 'system-ui, sans-serif',
        }}
        dangerouslySetInnerHTML={{ __html: FALLBACK_HTML }}
      />
      <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
    </>
  );
}
