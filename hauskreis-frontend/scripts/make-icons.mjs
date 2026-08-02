/**
 * Erzeugt die PWA-Symbole aus einem SVG. Einmal laufen lassen und die
 * Ergebnisse einchecken — zur Bauzeit braucht es das Skript nicht:
 *
 *   node scripts/make-icons.mjs
 *
 * `sharp` ist dafür als devDependency da — Next bringt es zwar transitiv mit,
 * aber pnpm legt transitive Pakete bewusst nicht in die oberste Ebene.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const TERRACOTTA = '#cc7a5e';
const CANVAS = '#faf6f3';

/** Ein Dach über zwei Kreisen: Hauskreis, ohne Text, der klein zumatscht. */
function svg({ size, padding, background }) {
  const inner = size - padding * 2;
  const s = (value) => padding + (value / 100) * inner;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${background}"/>
  <path d="M ${s(18)} ${s(48)} L ${s(50)} ${s(20)} L ${s(82)} ${s(48)}"
        fill="none" stroke="${CANVAS}" stroke-width="${inner * 0.09}"
        stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="${s(36)}" cy="${s(68)}" r="${inner * 0.11}" fill="${CANVAS}"/>
  <circle cx="${s(64)}" cy="${s(68)}" r="${inner * 0.11}" fill="${CANVAS}"/>
  <circle cx="${s(50)}" cy="${s(84)}" r="${inner * 0.11}" fill="${CANVAS}" opacity="0.75"/>
</svg>`;
}

const targets = [
  { file: 'icon-192.png', size: 192, padding: 16, background: TERRACOTTA },
  { file: 'icon-512.png', size: 512, padding: 44, background: TERRACOTTA },
  // Maskable: außen 20 % Luft, damit kein Beschnitt ins Motiv schneidet.
  {
    file: 'icon-maskable-512.png',
    size: 512,
    padding: 102,
    background: TERRACOTTA,
  },
  {
    file: 'apple-touch-icon.png',
    size: 180,
    padding: 14,
    background: TERRACOTTA,
  },
  { file: 'badge-72.png', size: 72, padding: 6, background: TERRACOTTA },
];

await mkdir(new URL('../public/icons/', import.meta.url), { recursive: true });

for (const target of targets) {
  const source = Buffer.from(svg(target));
  const png = await sharp(source).png().toBuffer();
  const path = new URL(`../public/icons/${target.file}`, import.meta.url);
  await writeFile(path, png);
  console.log(`✓ public/icons/${target.file}`);
}
