/**
 * Das Impressum — `/impressum`, ohne Anmeldung erreichbar.
 *
 * Server-Komponente aus demselben Grund wie die Datenschutzerklärung; die
 * Begründung steht dort ausführlich.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import { LegalPage } from '@/components/layout/legal-page';

export const metadata: Metadata = {
  title: 'Impressum · Acts2',
};

export default function ImpressumPage() {
  const markdown = readFileSync(
    path.join(process.cwd(), 'content/impressum.md'),
    'utf8',
  );

  return <LegalPage title="Impressum" markdown={markdown} />;
}
