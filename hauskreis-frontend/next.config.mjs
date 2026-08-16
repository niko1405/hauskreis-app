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

export default isProduction
  ? withSerwistInit({
      swSrc: 'src/app/sw.ts',
      swDest: 'public/sw.js',
      reloadOnOnline: true,
      // Was aus `public/` vorgeladen wird: alles außer Dateien, deren Name mit
      // einem Unterstrich beginnt.
      //
      // Gemeint ist `_headers`. Für Cloudflare Pages ist das keine Datei,
      // sondern eine Anweisung — Pages liest sie beim Deploy aus und liefert
      // sie danach nicht mehr aus. Unter ihrer eigenen Adresse ist sie ein
      // 404. In der Precache-Liste stand sie trotzdem, weil sie nun einmal in
      // `public/` liegt.
      //
      // Das war kein Schönheitsfehler, sondern der teuerste Fehler dieses
      // Deployments. Ein Service Worker installiert ganz oder gar nicht: Ein
      // einziger Eintrag, der beim Vorladen 404 liefert, lässt `install`
      // scheitern. Der Worker wird nie aktiv, `navigator.serviceWorker.ready`
      // bleibt für immer offen, und nichts landet im Zwischenspeicher. Daran
      // hingen zwei Fehler, die nach ganz verschiedenen Dingen aussahen: Push
      // ließ sich auf keinem Gerät einschalten („Hintergrunddienst ist noch
      // nicht bereit"), und offline kam eine leere Seite statt der App.
      //
      // Warum dieses Muster und keine Ausschlussliste: `globPublicPatterns`
      // geht unverändert an `globSync`, und node-glob kennt kein
      // Ausrufezeichen-Präfix — ein zusätzliches '!_headers' in der Liste sieht
      // richtig aus und bewirkt nichts. `manifestTransforms` hilft ebenso
      // wenig: Es sieht nur die Webpack-Dateien, die aus `public/` kommen erst
      // danach dazu.
      //
      // Nebenwirkung, bewusst in Kauf genommen: Eine Datei in `public/`, die
      // absichtlich mit `_` anfängt, wird nicht vorgeladen. Dieselbe Regel
      // fängt dafür `_redirects` und `_routes.json` gleich mit ab.
      globPublicPatterns: ['**/!(_*)'],
    })(nextConfig)
  : nextConfig;
