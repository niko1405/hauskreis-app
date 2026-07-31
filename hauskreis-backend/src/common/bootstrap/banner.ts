import { hostname, cpus, release, type as osType } from 'node:os';
import type { RouteGroup, RouteInfo } from './routes';

export interface BannerInfo {
  version: string;
  environment: string;
  /** Die Adresse, auf die tatsächlich gebunden wurde. */
  host: string;
  port: number;
  globalPrefix: string;
  keycloakUrl: string;
  keycloakRealm: string;
  corsOrigins: readonly string[];
  pushEnabled: boolean;
  routes: RouteInfo[];
  groups: RouteGroup[];
}

/**
 * Der Startbildschirm.
 *
 * Rendert in einen String statt direkt zu schreiben — so lässt sich der Inhalt
 * testen, ohne die Konsole abzufangen.
 *
 * Bewusst nicht über den Logger: pino würde jede Zeile in ein JSON-Objekt mit
 * Zeitstempel verpacken, und ein Kasten aus Rahmenzeichen sähe darin aus wie
 * ein Unfall. Der Banner ist einmalige Ausgabe für Menschen, kein Log-Ereignis.
 */
export function renderBanner(info: BannerInfo, colors: boolean): string {
  const paint = (code: string, text: string) =>
    colors ? `\u001b[${code}m${text}\u001b[0m` : text;
  const dim = (text: string) => paint('2', text);
  const bold = (text: string) => paint('1', text);
  const label = (text: string) => dim(text.padEnd(10));

  const base = `http://${displayHost(info.host)}:${info.port}${info.globalPrefix}`;
  const title = `Hauskreis API  ·  v${info.version}  ·  ${info.environment}`;
  const border = '─'.repeat(title.length + 4);

  const lines = [
    '',
    dim(`  ╭${border}╮`),
    `${dim('  │  ')}${bold(title)}${dim('  │')}`,
    dim(`  ╰${border}╯`),
    '',
    `  ${label('Adresse')}${base}`,
    `  ${label('Health')}${base}/health`,
    `  ${label('System')}${osType()} ${release()} · ${process.arch} · ${cpus().length} CPUs · ${hostname()}`,
    `  ${label('Laufzeit')}Node ${process.version} · PID ${process.pid}`,
    `  ${label('Keycloak')}${info.keycloakUrl} · Realm ${info.keycloakRealm}`,
    `  ${label('CORS')}${
      info.corsOrigins.length > 0
        ? info.corsOrigins.join(', ')
        : 'keine Origin erlaubt'
    }`,
    `  ${label('Push')}${info.pushEnabled ? 'aktiv' : 'deaktiviert (keine VAPID-Schlüssel)'}`,
    '',
    `  ${label('Routen')}${info.routes.length}`,
    ...formatGroups(info.groups, dim),
    '',
  ];

  return lines.join('\n');
}

/**
 * Die Gruppen in Spalten, damit vierzehn Zeilen nicht den halben Bildschirm
 * füllen. Vier pro Zeile passen auch in ein schmales Terminal.
 */
function formatGroups(
  groups: RouteGroup[],
  dim: (text: string) => string,
): string[] {
  const perRow = 4;
  // Nach der *sichtbaren* Breite ausrichten. `padEnd` zählt die ANSI-Escapes
  // mit, die `dim()` einfügt — damit rutscht jede eingefärbte Spalte um acht
  // Zeichen nach links.
  const width = Math.max(...groups.map((group) => plain(group).length), 0) + 3;
  const rows: string[] = [];

  for (let index = 0; index < groups.length; index += perRow) {
    const cells = groups.slice(index, index + perRow).map((group) => {
      const padding = ' '.repeat(Math.max(width - plain(group).length, 1));
      return `${group.name} ${dim(String(group.count))}${padding}`;
    });

    rows.push(`${' '.repeat(12)}${cells.join('')}`.trimEnd());
  }

  return rows;
}

/** Die Zelle ohne Einfärbung — die Breite, die im Terminal wirklich zählt. */
function plain(group: RouteGroup): string {
  return `${group.name} ${group.count}`;
}

/**
 * `0.0.0.0` ist die Bindeadresse, keine, die man anklicken kann — im Banner
 * würde sie zu einem Link führen, der nirgends hingeht.
 */
function displayHost(host: string): string {
  return host === '0.0.0.0' || host === '::' ? 'localhost' : host;
}
