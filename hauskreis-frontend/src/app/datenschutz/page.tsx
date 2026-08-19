/**
 * Die Datenschutzerklärung — `/datenschutz`, ohne Anmeldung erreichbar.
 *
 * Eine **Server-Komponente**: Der Text kommt aus `content/datenschutz.md`, und
 * gelesen wird er zur Bauzeit. Beim statischen Export (`output: 'export'`)
 * rendert Next jede Seite ohnehin beim Bauen — zur Laufzeit gibt es hier weder
 * Server noch Dateisystem, und es braucht auch keines.
 *
 * Der Umweg über eine echte `.md`-Datei statt einer Zeichenkette im Quelltext
 * hat einen praktischen Grund: Was ein Generator ausspuckt, fügt man dort ein,
 * ohne auf Backticks oder `${` achten zu müssen — und ohne eine Bundler-Regel,
 * die `next.config.mjs` teuer zu stehen käme (Turbopack in der Entwicklung,
 * webpack nur für den Produktionsbau).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import { LegalPage } from '@/components/layout/legal-page';

export const metadata: Metadata = {
  title: 'Datenschutzerklärung · Acts2',
};

export default function DatenschutzPage() {
  const markdown = readFileSync(
    path.join(process.cwd(), 'content/datenschutz.md'),
    'utf8',
  );

  return <LegalPage title="Datenschutzerklärung" markdown={markdown} />;
}
