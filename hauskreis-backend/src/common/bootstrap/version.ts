import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Die Version aus der package.json.
 *
 * Nicht als Import: die Datei liegt außerhalb von `rootDir`, ein
 * `import … from '../../../package.json'` würde das Ausgabe-Layout unter `dist`
 * verschieben. Der Umweg über `cwd` ist verlässlich, weil der Prozess immer aus
 * dem Projektverzeichnis startet — `pnpm start`, `node dist/src/main` und das
 * `WORKDIR /app` des Images tun das alle.
 *
 * Schlägt es fehl, ist das kein Grund, den Server nicht zu starten.
 */
export function appVersion(): string {
  try {
    const raw = readFileSync(join(process.cwd(), 'package.json'), 'utf8');
    return (JSON.parse(raw) as { version?: string }).version ?? 'unbekannt';
  } catch {
    return 'unbekannt';
  }
}
