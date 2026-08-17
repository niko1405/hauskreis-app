import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import withSerwistInit from '@serwist/next';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /**
   * Statischer Export nach `out/`, von dort liefert Cloudflare Pages aus.
   *
   * Das ist keine Sparmaßnahme, sondern das, was diese App ohnehin ist: Es gibt
   * keinen Route Handler, keine Server Action, kein `next/headers`, keine
   * Middleware und kein ISR. Daten holt durchweg der Browser, weil das Token
   * dort lebt — serverseitig vorzuladen hieße, es dorthin zu reichen. Next ist
   * hier Anwendungsgerüst und Router, und ein Router braucht zur Laufzeit
   * keinen Server.
   *
   * Was der Export verlangt hat: Termin- und Themen-Detailseite tragen ihre Id
   * in der Query (`/termin?id=…`), nicht im Pfad. Ein Pfadsegment `[id]`
   * bräuchte `generateStaticParams` — eine zur Bauzeit bekannte Liste aller
   * Adressen. Die gibt es nicht, die Ids entstehen im Betrieb.
   */
  output: 'export',
};

/**
 * Der Service Worker wird aus `src/app/sw.ts` gebaut und nach `public/sw.js`
 * gelegt. Zwei Dinge sind dabei zu wissen:
 *
 * 1. Im Entwicklungsmodus bleibt er aus — ein aktiver SW macht Hot-Reload und
 *    das Beobachten von API-Aufrufen unnötig undurchsichtig.
 * 2. `@serwist/next` arbeitet mit webpack. Next 16 baut standardmäßig mit
 *    Turbopack und bricht ab, sobald eine webpack-Konfiguration vorliegt.
 *    Deshalb wird das Plugin nur für den Produktionsbau überhaupt
 *    eingehängt (Entwicklung bleibt damit auf Turbopack), und `pnpm build`
 *    läuft mit `--webpack`.
 */
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Die Dateien aus `public/`, die vorgeladen werden sollen.
 *
 * Hier stand einmal `globPublicPatterns: ['**' + '/!(_*)']`, und Serwist hat
 * die Liste selbst gebildet. Das geht nicht mehr, sobald
 * `additionalPrecacheEntries` gesetzt ist: Die beiden Optionen schließen
 * einander aus (`@serwist/next/dist/index.mjs`, „if (!resolvedManifestEntries)"
 * — der Glob läuft nur, wenn das Feld fehlt). Wer eines setzt, muss das andere
 * mitliefern; sonst fallen Icons und Manifest lautlos aus dem Precache.
 *
 * Die beiden Ausnahmen sind dieselben wie vorher:
 *
 * 1. **Namen mit `_` am Anfang.** Gemeint ist `_headers`. Für Cloudflare Pages
 *    ist das keine Datei, sondern eine Anweisung — Pages liest sie beim Deploy
 *    aus und liefert sie danach nicht mehr aus. Unter ihrer eigenen Adresse
 *    ist sie ein 404, und ein Service Worker installiert ganz oder gar nicht:
 *    Ein einziger Eintrag, der beim Vorladen fehlschlägt, lässt `install`
 *    scheitern, der Worker wird nie aktiv und nichts landet im
 *    Zwischenspeicher. Daran hingen einmal zwei Fehler, die nach ganz
 *    verschiedenen Dingen aussahen: Push ließ sich auf keinem Gerät
 *    einschalten, und offline kam eine leere Seite statt der App.
 * 2. **Der Worker selbst.** `swDest` schreibt ihn nach `public/`, er darf sich
 *    nicht in seine eigene Liste aufnehmen.
 */
function publicFiles(dir = 'public', prefix = '') {
  const skip = /^(sw\.js(\.map)?|swe-worker-.*\.js)$/;

  return readdirSync(path.join(process.cwd(), dir), { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('_') && !skip.test(entry.name))
    .flatMap((entry) => {
      const relative = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        return publicFiles(path.join(dir, entry.name), relative);
      }
      const contents = readFileSync(path.join(process.cwd(), dir, entry.name));
      return [
        {
          url: relative,
          revision: createHash('md5').update(contents).digest('hex'),
        },
      ];
    });
}

/**
 * Eine Marke, die sich mit jedem Bau ändert.
 *
 * Für `/` lässt sich keine Prüfsumme über den Inhalt bilden: Das HTML gibt es
 * zu diesem Zeitpunkt noch nicht — Next schreibt es erst nach dem Webpack-Lauf,
 * in dem Serwist sein Manifest einspeist. Genau das ist auch der Grund, warum
 * bis hierher überhaupt kein Dokument im Precache lag.
 *
 * Cloudflare Pages setzt `CF_PAGES_COMMIT_SHA` von selbst; lokal tut es die
 * Uhrzeit. Ein paar Kilobyte HTML je Deploy neu zu laden kostet nichts.
 */
const buildId = process.env.CF_PAGES_COMMIT_SHA ?? String(Date.now());

export default isProduction
  ? withSerwistInit({
      swSrc: 'src/app/sw.ts',
      swDest: 'public/sw.js',
      reloadOnOnline: true,
      additionalPrecacheEntries: [
        ...publicFiles(),

        /**
         * Die App-Hülle.
         *
         * Ohne sie hing der Start ohne Netz allein an der Laufzeit-Regel in
         * `sw.ts` — und die kann nur ausliefern, was schon einmal online
         * abgerufen wurde. Beim allerersten Start nach dem Installieren war
         * das nichts, und die App blieb schwarz.
         *
         * Damit wandert `/` von der `pages`-Regel (Netz zuerst) in den
         * Precache (Zwischenspeicher zuerst): `PrecacheRoute` wird vor allen
         * `runtimeCaching`-Regeln registriert. Das ist die übliche Mechanik
         * einer App-Hülle und nebenbei die stimmigere — vorher holte ein Start
         * nach einem Deploy das neue HTML mit neuen Chunk-Namen, während die
         * alten Chunks noch im Zwischenspeicher lagen. Jetzt gehören Hülle und
         * Chunks zusammen, bis der neue Worker übernimmt.
         *
         * **Nur `/`, nicht die übrigen sieben Seiten.** Jeder Eintrag ist ein
         * weiterer Weg, den ganzen Worker lahmzulegen (siehe oben). Die PWA
         * startet immer auf `start_url`, und von dort wechselt der App Router
         * die Seiten ohne ein weiteres Dokument.
         */
        { url: '/', revision: buildId },
      ],
    })(nextConfig)
  : nextConfig;
