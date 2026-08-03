/**
 * Adressen vergleichbar machen und Zuhause benennen.
 *
 * Beides hängt zusammen: ein Zuhause wird über seine Adresse erkannt und über
 * seine Bewohner:innen benannt. Steht hier statt im Service, weil es reine
 * Textarbeit ohne Datenbank ist — und weil an dieser Stelle entschieden wird,
 * ob zwei Menschen als Wohngemeinschaft gelten. Das gehört getestet.
 */

const TRANSLITERATIONS: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  ß: 'ss',
};

/**
 * Reduziert eine Adresse auf das, was sie identifiziert.
 *
 * „Marienstr. 35, 76137 Karlsruhe" und „Marienstraße 35, 76137 Karlsruhe"
 * ergeben denselben Schlüssel — sonst zöge die zweite Person derselben Wohnung
 * ein zweites Zuhause auf, und die Host-Gewichtung zählte den Haushalt doppelt.
 *
 * Bewusst grob: Groß-/Kleinschreibung, Umlaute, Abkürzungen, Satzzeichen und
 * Leerraum fallen weg. Lieber zwei Schreibweisen zusammenführen und einmal
 * nachfragen, als dieselbe Wohnung zweimal zu führen. Deshalb fragt der
 * Aufrufer nach, bevor er jemanden einziehen lässt.
 */
export function normalizeAddress(address: string): string {
  const lowered = address.toLowerCase();

  const spelled = lowered.replace(
    /[äöüß]/g,
    (character) => TRANSLITERATIONS[character] ?? character,
  );

  // Erst der Punkt, dann die Abkürzung: „marienstr." wird zu „marienstr ",
  // und „str" am Wortende ist dasselbe wie „strasse".
  const expanded = spelled
    .replace(/\./g, ' ')
    .replace(/str(?=\s|$|\d)/g, 'strasse');

  return expanded.replace(/[^a-z0-9]/g, '');
}

/** Ob zwei Anschriften dieselbe Wohnung meinen. */
export function isSameAddress(a: string, b: string): boolean {
  return normalizeAddress(a) === normalizeAddress(b);
}

/**
 * Wie ein Zuhause heißt: „Bei Niko", „Bei Niko & Chris".
 *
 * Nur der Vorname — „Bei Niko" ist, wie die Gruppe redet, und der volle Name
 * stünde in jeder Terminkarte und jeder Tabellenzelle im Weg. Dass zwei
 * Vornamen gleich sein könnten, ist kein Problem mehr: eindeutig ist die
 * Wohnung über ihre Adresse, nicht über ihren Namen.
 */
export function homeName(residentNames: readonly string[]): string {
  const firstNames = residentNames
    .map((name) => name.trim().split(/\s+/)[0])
    .filter((name) => name.length > 0);

  if (firstNames.length === 0) {
    // Kommt nur vor, wenn die letzte Person auszieht — dann wird das Zuhause
    // stillgelegt und der Name bleibt als Erinnerung an vergangene Abende.
    return 'Ehemaliges Zuhause';
  }

  if (firstNames.length === 1) {
    return `Bei ${firstNames[0]}`;
  }

  const last = firstNames[firstNames.length - 1];
  const rest = firstNames.slice(0, -1);

  return `Bei ${rest.join(', ')} & ${last}`;
}
