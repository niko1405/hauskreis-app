import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
});
