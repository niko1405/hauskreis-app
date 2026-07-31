import { renderBanner, type BannerInfo } from './banner';

const info: BannerInfo = {
  version: '1.2.3',
  environment: 'development',
  host: '0.0.0.0',
  port: 3000,
  globalPrefix: '/api',
  keycloakUrl: 'http://localhost:8080',
  keycloakRealm: 'hauskreis',
  corsOrigins: ['http://localhost:3001'],
  pushEnabled: true,
  routes: [
    { method: 'GET', path: '/api/health' },
    { method: 'GET', path: '/api/me' },
  ],
  groups: [
    { name: 'meetings', count: 19 },
    { name: 'push', count: 7 },
  ],
};

describe('renderBanner', () => {
  it('names the pieces you would otherwise go looking for', () => {
    const banner = renderBanner(info, false);

    expect(banner).toContain('Hauskreis API  ·  v1.2.3  ·  development');
    expect(banner).toContain('http://localhost:3000/api/health');
    expect(banner).toContain('Realm hauskreis');
    expect(banner).toContain('http://localhost:3001');
    expect(banner).toContain('meetings 19');
  });

  // 0.0.0.0 ist die Bindeadresse, kein Ziel — als Link ginge sie ins Leere.
  it('shows the bind address as something you can actually open', () => {
    expect(renderBanner(info, false)).toContain('http://localhost:3000/api');
    expect(renderBanner(info, false)).not.toContain('http://0.0.0.0');
  });

  it('says so when push is off rather than staying silent', () => {
    const banner = renderBanner({ ...info, pushEnabled: false }, false);

    expect(banner).toContain('deaktiviert');
  });

  // origin: false heißt, dass der Browser jede fremde Origin blockt. Das ist
  // eine Konfiguration, die man beim Start sehen will, kein leeres Feld.
  it('spells out an empty CORS allowlist', () => {
    const banner = renderBanner({ ...info, corsOrigins: [] }, false);

    expect(banner).toContain('keine Origin erlaubt');
  });

  it('leaves out escape codes when the output is not a terminal', () => {
    expect(renderBanner(info, false)).not.toContain(CSI);
    expect(renderBanner(info, true)).toContain(CSI);
  });

  // padEnd zählt die unsichtbaren ANSI-Zeichen mit; ohne eigene Breitenrechnung
  // rutscht jede eingefärbte Spalte um acht Zeichen nach links.
  it('aligns the group columns the same way with and without colour', () => {
    expect(stripAnsi(renderBanner(info, true))).toBe(renderBanner(info, false));
  });
});

/** Control Sequence Introducer — womit jeder ANSI-Code beginnt. */
const CSI = '\u001b[';

/**
 * Ein Steuerzeichen in einem regulären Ausdruck ist fast immer ein Versehen —
 * die Regel dagegen ist zu Recht an. Hier ist genau das die Absicht: der Test
 * prüft, dass Einfärbung nichts an der Ausrichtung ändert, und dafür müssen die
 * ANSI-Codes wieder heraus.
 */
// oxlint-disable-next-line no-control-regex
const ANSI_CODE = /\u001b\[\d+m/g;

function stripAnsi(text: string): string {
  return text.replaceAll(ANSI_CODE, '');
}
