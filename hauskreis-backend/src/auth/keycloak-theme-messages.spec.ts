import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Hält die beiden Sprachfassungen jedes Themes zusammen.
 *
 * **Der Fehler, den dieser Test verhindert, ist einmal passiert.** Die
 * Einladungsmail kam mit den Namen ihrer Textbausteine an — „emailBrand",
 * „executeActionsHeadline", „executeActionsButton" — statt mit den Sätzen. Das
 * Aussehen stimmte, die Vorlagen wurden also gefunden; nur das Bündel, aus dem
 * `msg()` liest, kannte die Schlüssel nicht.
 *
 * Der Grund liegt darin, wie Keycloak ein Bündel baut: **zwei Durchgänge**,
 * erst Englisch über die ganze Theme-Kette, dann die gewünschte Sprache
 * darüber. Ohne englische Fassung hängen alle eigenen Schlüssel allein daran,
 * dass die aufgelöste Sprache wirklich `de` ist — und das ist eine
 * Realm-Einstellung, die man vergessen, überschreiben oder pro Nutzer anders
 * haben kann. Mit ihr kann keine Spracheinstellung mehr danebengreifen.
 *
 * Der Preis ist eine Datei doppelt, und die driftet, wenn niemand hinsieht: Wer
 * einen Satz nur in `messages_de` ändert, merkt nichts — es sei denn, jemand
 * schaltet die Sprache um, und dann steht dort wieder der alte Text. Deshalb
 * dieser Test. Er prüft **Schlüssel und Werte**, nicht die Kommentare: die
 * Erklärungen zu Platzhalter-Nummern und verdoppeltem Apostroph stehen bewusst
 * nur in der deutschen Datei, sie ist die, die man liest.
 */

const THEMES = join(__dirname, '..', '..', 'keycloak', 'themes', 'hauskreis');

/**
 * Liest eine Properties-Datei so, wie Java sie liest — Kommentare und
 * Leerzeilen weg, alles vor dem ersten `=` ist der Schlüssel.
 *
 * Bewusst schlicht: Die Dateien hier benutzen keine Zeilenfortsetzung und keine
 * `:`-Trennung, und ein vollständiger Properties-Parser wäre mehr Code als das,
 * was er prüfen soll. Sollte das je nicht mehr stimmen, fällt es genau hier auf.
 */
function readProperties(file: string): Map<string, string> {
  const entries = new Map<string, string>();

  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    entries.set(trimmed.slice(0, separator), trimmed.slice(separator + 1));
  }

  return entries;
}

/**
 * Jede `.ftl` eines Themes, samt Unterordnern.
 *
 * Das E-Mail-Theme legt seine Vorlagen unter `html/`, das Anmelde-Theme direkt
 * daneben — eine feste Liste hätte deshalb schon zweimal danebengegriffen.
 */
function templates(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return templates(path);
    return entry.name.endsWith('.ftl') ? [path] : [];
  });
}

/**
 * Welche Textbausteine eine Vorlage anfordert.
 *
 * `msg("schlüssel")` und `msg('schlüssel', arg)` — nur die Fälle mit einem
 * festen Namen.
 *
 * **Zusammengesetzte Namen fallen heraus.** `msg("requiredAction.${'$'}{item}")`
 * in `info.ftl` setzt den Schlüssel erst zur Laufzeit aus einer Schleifen-
 * variablen zusammen; welche Werte dabei herauskommen, weiß nur Keycloak. Ihn
 * hier zu verlangen hieße, den Test gegen eine Frage zu stellen, die er nicht
 * beantworten kann.
 */
function requestedKeys(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(/\bmsg\(\s*["']([^"']+)["']/g)]
    .map((match) => match[1]!)
    .filter((key) => !key.includes('${'));
}

describe.each(['email', 'login'])('Keycloak-Theme %s', (theme) => {
  const german = readProperties(
    join(THEMES, theme, 'messages', 'messages_de.properties'),
  );
  const fallback = readProperties(
    join(THEMES, theme, 'messages', 'messages_en.properties'),
  );

  it('hat überhaupt Texte', () => {
    // Sonst bestünde ein leeres Paar diesen Test mit Bravour.
    expect(german.size).toBeGreaterThan(10);
  });

  it('kennt in beiden Sprachen dieselben Schlüssel', () => {
    expect([...fallback.keys()].toSorted()).toEqual(
      [...german.keys()].toSorted(),
    );
  });

  it('trägt in beiden Sprachen dieselben Texte', () => {
    expect(Object.fromEntries(fallback)).toEqual(Object.fromEntries(german));
  });

  /**
   * Der Test, der beim ersten Anlauf gefehlt hat.
   *
   * Die beiden darüber halten die Sprachfassungen zusammen — sie hätten auch
   * dann bestanden, wenn in *beiden* ein Schlüssel fehlt, den die Vorlage
   * anfordert. Genau das ist der Zustand, den man in der Mail sieht: Wo nichts
   * definiert ist, gibt `msg()` den Namen zurück, und der steht dann im Text.
   *
   * Geprüft wird gegen die deutsche Fassung; die englische ist über den Test
   * darüber bereits deckungsgleich.
   *
   * Nicht geprüft wird die Gegenrichtung. `messages_de` definiert
   * absichtlich mehr, als die eigenen Vorlagen anfordern: die Betreffzeilen
   * liest Keycloaks Java-Seite, die Klartext-Fassungen der Mails kommen aus
   * den geerbten Vorlagen von `base`.
   */
  it('definiert jeden Baustein, den seine Vorlagen anfordern', () => {
    const missing = new Map<string, string[]>();

    for (const file of templates(join(THEMES, theme))) {
      const unknown = requestedKeys(file).filter((key) => !german.has(key));
      // Der Pfad ab dem Theme reicht, um die Datei zu finden — der Rest wäre
      // die Verzeichnisstruktur des jeweiligen Rechners im Fehlerbericht.
      if (unknown.length > 0) {
        missing.set(relative(THEMES, file), [...new Set(unknown)]);
      }
    }

    expect(Object.fromEntries(missing)).toEqual({});
  });
});
