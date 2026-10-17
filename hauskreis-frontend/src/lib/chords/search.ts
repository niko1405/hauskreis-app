/**
 * Einen Akkord finden, den das Lied noch nicht hat — für die Leiste im Editor.
 *
 * Die Vorschläge dort sind die Akkorde des Lieds und die Stufen der Tonart;
 * meistens reicht das. Für den Rest gibt es eine Suche über einen Katalog aus
 * den zwölf Grundtönen in beiden Schreibweisen und den Endungen, die in
 * Lobpreis-Blättern tatsächlich vorkommen. Was darüber hinausgeht („C/E",
 * „F#m7b5"), lässt sich frei eintippen: Ist es ein Akkord, steht es vorn.
 */
import { isChord, spellNote, type Notation } from './chord';

const SUFFIXES = [
  '',
  'm',
  '7',
  'm7',
  'maj7',
  'sus2',
  'sus4',
  'add9',
  '6',
  'm6',
  '9',
  'dim',
  'dim7',
  'aug',
  '7sus4',
  'm7b5',
  '5',
];

const ROOT = /^[A-H][#b♯♭]?/;

/** Alle Grundtöne in Kreuz- und B-Schreibung, in Halbton-Reihenfolge. */
function roots(notation: Notation): string[] {
  const names: string[] = [];
  for (let value = 0; value < 12; value += 1) {
    for (const flats of [false, true]) {
      const name = spellNote(value, { flats, notation });
      if (!names.includes(name)) names.push(name);
    }
  }
  return names;
}

/** „f#m" → „F#m": Den Grundton schreibt beim Suchen niemand groß. */
function normalizeQuery(query: string): string {
  const compact = query.replace(/\s+/g, '');
  if (!/^[a-h]/.test(compact)) return compact;
  return compact.charAt(0).toUpperCase() + compact.slice(1);
}

export function searchChords(
  query: string,
  {
    notation,
    preferred = [],
    limit = 24,
  }: { notation: Notation; preferred?: readonly string[]; limit?: number },
): string[] {
  const typed = normalizeQuery(query);
  if (typed === '') return [...new Set(preferred)].slice(0, limit);

  const catalog = roots(notation).flatMap((root) =>
    SUFFIXES.map((suffix) => `${root}${suffix}`),
  );
  const needle = typed.toLowerCase();
  const matches = (chord: string) => chord.toLowerCase().startsWith(needle);

  // Erst der Grundton, den man getippt hat: Bei „A" kommen A, Am, A7 vor
  // Ab und A#, auch wenn die im Katalog früher stehen.
  const typedRoot = ROOT.exec(typed)?.[0];
  const sameRoot = (chord: string) => ROOT.exec(chord)?.[0] === typedRoot;
  const fromCatalog = catalog
    .filter(matches)
    .toSorted((a, b) => Number(sameRoot(b)) - Number(sameRoot(a)));

  const exact = isChord(typed) ? [typed] : [];

  return [
    ...new Set([...exact, ...preferred.filter(matches), ...fromCatalog]),
  ].slice(0, limit);
}
