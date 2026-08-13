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
  startupSeconds: 1.23,
};

describe('renderBanner', () => {
  it('names the pieces you would otherwise go looking for', () => {
    const banner = renderBanner(info, false);

    expect(banner).toContain('Acts2 API  ·  v1.2.3  ·  development');
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

  // Nests eigenes "successfully started" ist stummgeschaltet. Ohne Ersatz
  // sieht ein Start, nach dem nichts mehr kommt, aus wie ein hängender
  // Prozess — genau so ist es einmal gemeldet worden.
  it('ends by saying that it is actually running', () => {
    const lines = renderBanner(info, false).trimEnd().split('\n');

    expect(lines.at(-1)).toContain('Bereit in 1.2 s');
  });

  // Im Container landet der Banner in `docker logs`, wo niemand Strg+C drücken
  // kann — dort beendet `docker stop`. Der Hinweis gehört also ans Terminal.
  it('only offers the Ctrl+C hint on a terminal', () => {
    expect(renderBanner(info, true)).toContain('Strg+C');
    expect(renderBanner(info, false)).not.toContain('Strg+C');
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
  //
  // Verglichen wird bis zur Routen-Auflistung: die Schlussfolge darf sich
  // unterscheiden, weil der Strg+C-Hinweis nur am Terminal steht.
  it('aligns the group columns the same way with and without colour', () => {
    expect(upToGroups(stripAnsi(renderBanner(info, true)))).toBe(
      upToGroups(renderBanner(info, false)),
    );
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

/** Der Teil vor der Schlusszeile — dort darf sich die Ausgabe unterscheiden. */
function upToGroups(text: string): string {
  return text.split('Bereit')[0]?.trimEnd() ?? '';
}

function stripAnsi(text: string): string {
  return text.replaceAll(ANSI_CODE, '');
}
