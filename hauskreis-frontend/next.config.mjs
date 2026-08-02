import withSerwistInit from '@serwist/next';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
