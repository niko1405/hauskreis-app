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
    })(nextConfig)
  : nextConfig;
