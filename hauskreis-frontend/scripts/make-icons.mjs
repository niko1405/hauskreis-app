/**
 * Erzeugt alle Symbole aus dem Logo. Einmal laufen lassen und die Ergebnisse
 * einchecken — zur Bauzeit braucht es das Skript nicht:
 *
 *   node scripts/make-icons.mjs
 *
 * Quelle ist `acts2-logo.png` daneben: die Wortmarke „ACTS" mit dem Dach
 * darüber und der großen Zwei, 2000 × 2000. Sie liegt neben dem Skript und
 * nicht unter `public/`, weil sie **nicht** ausgeliefert wird — was der Browser
 * bekommt, sind die Ableitungen in `public/icons/`.
 *
 * `sharp` ist dafür als devDependency da — Next bringt es zwar transitiv mit,
 * aber pnpm legt transitive Pakete bewusst nicht in die oberste Ebene.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const TERRACOTTA = '#cc7a5e';
const CANVAS = '#faf6f3';

// Als Pfad, nicht als URL: `sharp` nimmt zum Lesen nur Zeichenketten und Buffer.
const SOURCE = fileURLToPath(new URL('acts2-logo.png', import.meta.url));
const OUT = new URL('../public/icons/', import.meta.url);

/**
 * Das Logo, freigestellt und auf eine quadratische Fläche gesetzt.
 *
 * `trim` ist der Grund, warum das überhaupt gut aussieht: Die Vorlage bringt
 * ringsum viel Weiß mit, und ohne Beschnitt säße die Marke später als
 * Briefmarke in der Mitte eines viel zu großen Feldes. Beschnitten wird auf den
 * tatsächlichen Inhalt, danach setzen wir den Rand selbst — für jedes Format
 * einen anderen.
 *
 * Heller Grund, nicht terracotta: Die Marke ist schwarz mit terracotta-Akzent
 * und lebt von hellem Untergrund. Ein farbiges Feld darunter würde die Zwei
 * verschlucken, und die ist das Erkennungszeichen.
 */
async function logoOn({ size, padding, background }) {
  const inner = size - padding * 2;

  const art = await sharp(SOURCE)
    // Die Vorlage hat keinen Alphakanal; ohne Schwellwert findet `trim` an
    // einer verrauschten Kante nichts zum Abschneiden.
    .trim({ threshold: 10 })
    // Das Weiß der Vorlage wird durchsichtig. Ohne das säße ein weißes
    // Quadrat in einem cremefarbenen Rahmen — der Unterschied zwischen
    // `#ffffff` und der Leinwandfarbe ist klein genug, um wie ein Fehler
    // auszusehen, und groß genug, um aufzufallen.
    .unflatten()
    .resize(inner, inner, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .composite([{ input: art, top: padding, left: padding }])
    .png()
    .toBuffer();
}

/**
 * Das Abzeichen an der Benachrichtigung.
 *
 * Hier **nicht** das Logo: Android benutzt allein den Alphakanal und färbt
 * jeden deckenden Bildpunkt einfarbig ein. Von „ACTS 2" bliebe bei 72 Pixeln
 * ein Klecks. Gezeichnet wird deshalb nur das Hausdach mit den drei Punkten —
 * dasselbe Motiv, das auch im Logo über der Wortmarke steht, und das einzige,
 * das in dieser Größe noch etwas erkennen lässt.
 */
function badgeSvg(size) {
  const s = (value) => (value / 100) * size;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <path d="M ${s(12)} ${s(52)} L ${s(50)} ${s(18)} L ${s(88)} ${s(52)}"
        fill="none" stroke="#ffffff" stroke-width="${s(9)}"
        stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="${s(38)}" cy="${s(64)}" r="${s(9)}" fill="#ffffff"/>
  <circle cx="${s(62)}" cy="${s(64)}" r="${s(9)}" fill="#ffffff"/>
  <circle cx="${s(50)}" cy="${s(83)}" r="${s(9)}" fill="#ffffff"/>
</svg>`;
}

const targets = [
  { file: 'icon-192.png', size: 192, padding: 14, background: CANVAS },
  { file: 'icon-512.png', size: 512, padding: 38, background: CANVAS },
  // Maskable: außen 20 % Luft, damit kein Beschnitt ins Motiv schneidet.
  // Android schneidet je nach Gerät Kreis, Rundeck oder Tropfen daraus.
  {
    file: 'icon-maskable-512.png',
    size: 512,
    padding: 102,
    background: CANVAS,
  },
  // iOS rundet selbst und mag keine Transparenz — deshalb voller Grund.
  {
    file: 'apple-touch-icon.png',
    size: 180,
    padding: 12,
    background: CANVAS,
  },
];

await mkdir(OUT, { recursive: true });

for (const target of targets) {
  const png = await logoOn(target);
  await writeFile(new URL(target.file, OUT), png);
  console.log(`✓ public/icons/${target.file}`);
}

// Das Abzeichen, einfarbig auf durchsichtigem Grund.
const badge = await sharp(Buffer.from(badgeSvg(72)))
  .png()
  .toBuffer();
await writeFile(new URL('badge-72.png', OUT), badge);
console.log('✓ public/icons/badge-72.png');

// Kein eigenes Favicon: `metadata.icons` in app/layout.tsx meldet schon
// `icon-192.png` als `rel="icon"`, und das nimmt der Browser fürs Tab. Ein
// zusätzliches `app/icon.png` wäre eine zweite Quelle für dieselbe Angabe —
// Next würde beide ausgeben, und welche gewinnt, hinge am Browser.

// Dieselbe Marke für Keycloaks Anmeldeseite. Das Theme zeigt sie über der
// Überschrift in 68 px mit `border-radius`, also reicht ein quadratisches PNG;
// es liegt im Backend, weil das Theme dort ins Image gemountet wird.
const keycloakLogo = await logoOn({
  size: 192,
  padding: 8,
  background: CANVAS,
});
const keycloakImg = new URL(
  '../../hauskreis-backend/keycloak/themes/hauskreis/login/resources/img/',
  import.meta.url,
);
await writeFile(new URL('logo.png', keycloakImg), keycloakLogo);
console.log('✓ keycloak/themes/hauskreis/login/resources/img/logo.png');

// Keycloaks favicon.ico. `.ico` kann sharp nicht schreiben — ein PNG unter
// diesem Namen akzeptieren alle heutigen Browser trotzdem, und genau das lag
// hier vorher auch schon (`MS Windows icon resource … with PNG image data`).
await writeFile(new URL('favicon.ico', keycloakImg), keycloakLogo);
console.log('✓ keycloak/themes/hauskreis/login/resources/img/favicon.ico');

console.log(`\nTerracotta ${TERRACOTTA}, Leinwand ${CANVAS}`);
