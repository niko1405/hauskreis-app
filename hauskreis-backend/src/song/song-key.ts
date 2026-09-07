/**
 * Lieder vergleichbar machen.
 *
 * Reine Textarbeit ohne Datenbank, wie `location/address.ts` — und aus
 * demselben Grund eine eigene Datei: Hier wird entschieden, ob zwei Einträge
 * dasselbe Lied meinen, und das gehört getestet.
 *
 * Gebraucht wird es von `SongLookupService`: Bevor ein Sprachmodell gefragt
 * wird, sieht der Server nach, ob das Lied schon irgendwo im System steht. Der
 * Vergleich muss dafür grob genug sein, um „Gott ist gut!" und „Gott ist gut"
 * zusammenzuführen — aber nur so grob. Ein falscher Treffer verlinkte ein
 * anderes Lied; ein verpasster kostet einen Modellaufruf.
 */

const TRANSLITERATIONS: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  ß: 'ss',
};

/**
 * Reduziert Titel oder Interpret auf das, was sie identifiziert.
 *
 * Groß-/Kleinschreibung, Umlaute, Satzzeichen und Leerraum fallen weg —
 * „Großer Gott, wir loben dich" und „grosser gott wir loben dich" ergeben
 * denselben Schlüssel.
 */
export function normalizeSongText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[äöüß]/g, (character) => TRANSLITERATIONS[character] ?? character)
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Was an einem Titel die **Aufnahme** beschreibt und nicht das Lied.
 *
 * „Goodness of God (Live)", „Goodness of God - Live" und „Goodness of God"
 * sind dasselbe Lied; im Archiv steht es unter irgendeiner der drei
 * Schreibweisen. Ohne diesen Schritt fand der Abgleich es nicht und fragte für
 * eine Antwort, die schon dastand, ein Sprachmodell.
 *
 * Drei Formen, und mehr bewusst nicht: eine Klammer am Ende, ein Zusatz hinter
 * einem Gedankenstrich, und die Besetzung („feat.", „ft."). Der Gedankenstrich
 * zählt **nur** vor einem der bekannten Wörter — „Herr, dein Name - meine
 * Zuflucht" ist ein Titel und keine Fassung, und ein Streichen bis zum Ende
 * nähme davon die Hälfte weg.
 */
const QUALIFIER_WORDS =
  'live|akustik|acoustic|unplugged|instrumental|radio edit|remix|reprise|demo|cover|version|remaster(?:ed)?|single|deutsch|german|english';

const TITLE_QUALIFIERS = new RegExp(
  [
    // In Klammern am Ende: „(Live)", „[Official Video]".
    String.raw`\s*[([][^)\]]*[)\]]\s*$`,
    // Hinter einem Gedankenstrich, aber nur mit einem der Wörter oben.
    String.raw`\s+[-–—]\s*(?:${QUALIFIER_WORDS})\b.*$`,
    // Die Besetzung, egal wo sie steht.
    String.raw`\s+(?:feat|ft)\.?\s.*$`,
  ].join('|'),
  'gi',
);

/**
 * Der Schlüssel, unter dem zwei Titel dasselbe Lied meinen.
 *
 * Bleibt nach dem Streichen nichts übrig, gilt der ungestrichene Titel: Ein
 * Lied, das wirklich „(Live)" heißt, bekäme sonst einen leeren Schlüssel — und
 * ein leerer Schlüssel passt auf jeden anderen leeren.
 */
export function songTitleKey(title: string): string {
  const stripped = normalizeSongText(title.replace(TITLE_QUALIFIERS, ''));

  return stripped === '' ? normalizeSongText(title) : stripped;
}

/**
 * Dasselbe für den Interpreten, nur ohne die Klammer-Regel.
 *
 * „Bethel Music feat. Jenn Johnson" und „Bethel Music" sind dieselbe Band mit
 * und ohne Gast. Eine Klammer trägt bei einem Interpreten dagegen oft den
 * unterscheidenden Teil („Casting Crowns (Live)" kommt nicht vor, „Die Priester
 * (Klassik)" schon), deshalb bleibt sie stehen.
 */
export function songArtistKey(artist: string): string {
  return normalizeSongText(artist.replace(/\s+(?:feat|ft)\.?\s.*$/gi, ''));
}

/**
 * Was an einer Adresse an Tracking hängt und nichts über die Seite sagt.
 *
 * Keine Liste aller denkbaren Parameter, sondern die, die tatsächlich an
 * geteilten Links kleben. Was übrig bleibt, bleibt stehen: `?tab=chords` bei
 * Ultimate Guitar unterscheidet zwei echte Seiten.
 */
const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|igshid$|ref$|si$|_branch)/;

/**
 * Reduziert eine Liedadresse auf das, was sie identifiziert.
 *
 * Schema und Host klein, `www.` weg, der Schrägstrich am Ende weg, das
 * Fragment weg, Tracking-Parameter weg. Alles andere bleibt: Der Pfad ist bei
 * vielen Seiten groß-/kleinschreibungsempfindlich, und ein normalisierter Pfad
 * fände Seiten, die es nicht gibt.
 *
 * Gibt `null` zurück, wenn das keine Adresse ist — der Aufrufer hat dann
 * nichts zu vergleichen.
 */
export function normalizeLyricsUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  // Neu aufgebaut statt im Laufen gelöscht: `searchParams` ist ein lebender
  // Iterator, und wer während der Runde löscht, überspringt den nächsten
  // Eintrag.
  const kept = [...url.searchParams].filter(
    ([key]) => !TRACKING_PARAMS.test(key),
  );
  url.search = new URLSearchParams(kept).toString();

  const host = url.host.toLowerCase().replace(/^www\./, '');
  const path = url.pathname.replace(/\/+$/, '');

  return `${host}${path}${url.search}`;
}

/**
 * Der Hostname einer Adresse, ohne `www.` — womit die Datenbank eingegrenzt
 * wird, bevor der genaue Vergleich in TypeScript stattfindet.
 *
 * Auf `lyrics_url` liegt kein Index, und es kommt auch keiner dazu: Bei ein
 * paar hundert Zeilen je Gruppe kostet die Einschränkung über den Host
 * ohnehin schon fast nichts, und ein Index auf einer Spalte, die niemand
 * sortiert, wäre Pflege ohne Gegenwert.
 */
export function lyricsUrlHost(raw: string): string | null {
  try {
    return new URL(raw).host.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}
