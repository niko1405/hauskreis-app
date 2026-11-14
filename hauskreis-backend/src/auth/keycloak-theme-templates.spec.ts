import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Hält die kopierten Anmelde-Vorlagen an der Keycloak-Version fest.
 *
 * Das Anmelde-Theme legt grundsätzlich nur ein Stylesheet über keycloak.v2.
 * Wo das nicht reicht, ist eine Vorlage kopiert und geändert — `info.ftl`,
 * `terms.ftl`, `login.ftl`, `register.ftl`. Eine Kopie veraltet still: Ändert
 * Keycloak sein Original, zeichnet es weiter unsere alte Fassung, und was im
 * neuen Original dazukam (ein Feld, ein Sicherheits-Hinweis), fehlt einfach.
 *
 * Jede Kopie nennt deshalb im Kopf, aus welcher Version sie stammt
 * („Kopiert aus Keycloak 26.4"), und dieser Test verlangt, dass das die
 * Version ist, die Compose startet. Wer Keycloak hebt, bekommt hier einen
 * roten Test statt einer Anmeldeseite, die halb aus der alten Version stammt —
 * vergleichen, anpassen, die Zahl im Kopf nachziehen.
 *
 * Geprüft wird Haupt- und Nebenversion, weil Compose auch nur die festlegt
 * (`keycloak:26.4`): Innerhalb einer Nebenversion ändert Keycloak seine
 * Vorlagen nicht.
 */

const BACKEND = join(__dirname, '..', '..');
const LOGIN_THEME = join(BACKEND, 'keycloak', 'themes', 'hauskreis', 'login');

const COPIED = ['info.ftl', 'terms.ftl', 'login.ftl', 'register.ftl'];

function composeVersion(file: string): string {
  const source = readFileSync(join(BACKEND, file), 'utf8');
  const match = /quay\.io\/keycloak\/keycloak:(\d+\.\d+)/.exec(source);
  if (!match) throw new Error(`Kein Keycloak-Image in ${file}`);
  return match[1]!;
}

function copiedFrom(template: string): string | null {
  const source = readFileSync(join(LOGIN_THEME, template), 'utf8');
  return /Kopiert aus Keycloak (\d+\.\d+)/.exec(source)?.[1] ?? null;
}

describe('Kopierte Keycloak-Vorlagen', () => {
  const version = composeVersion('docker-compose.yml');

  it('startet lokal und in der Produktion dieselbe Keycloak-Version', () => {
    expect(composeVersion('docker-compose.prod.yml')).toBe(version);
  });

  it.each(COPIED)('%s stammt aus der Version, die Compose startet', (file) => {
    expect(copiedFrom(file)).toBe(version);
  });
});

/**
 * Hält den Cache-Brecher am Stylesheet an dessen Inhalt fest.
 *
 * Keycloak liefert Theme-Dateien 30 Tage gecacht unter einer Adresse aus, die
 * sich nur mit dem Keycloak-Release ändert. Ohne neues `?v=` sähen Leute nach
 * einer CSS-Änderung die neuen Vorlagen mit der alten CSS — genau so stand
 * einmal ein kartenbreites Google-„G" auf der Registrierung. Der Wert ist der
 * Anfang des SHA-256 der Datei; die Zeilenenden werden vorher vereinheitlicht,
 * damit ein Checkout unter Windows nicht anders rechnet als der Server.
 */
describe('Stylesheet des Anmelde-Themes', () => {
  it('trägt in theme.properties den Stand seiner CSS', () => {
    const css = readFileSync(
      join(LOGIN_THEME, 'resources', 'css', 'hauskreis.css'),
      'utf8',
    ).replace(/\r\n/g, '\n');
    const expected = createHash('sha256').update(css).digest('hex').slice(0, 8);

    const properties = readFileSync(
      join(LOGIN_THEME, 'theme.properties'),
      'utf8',
    );
    const actual = /css\/hauskreis\.css\?v=([0-9a-f]+)/.exec(properties)?.[1];

    // Die Meldung soll den neuen Wert gleich mitliefern: Wer die CSS geändert
    // hat, trägt ihn in theme.properties ein und ist fertig.
    expect(`hauskreis.css?v=${actual}`).toBe(`hauskreis.css?v=${expected}`);
  });
});
