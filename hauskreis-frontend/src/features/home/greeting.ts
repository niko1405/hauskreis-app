/**
 * Die Begrüßung auf dem Startbildschirm.
 *
 * „Hallo Niko! Schön, dass du da bist." stand dort jeden Tag, und ein Satz, den
 * man jeden Tag liest, liest man irgendwann nicht mehr. Also mehrere.
 *
 * **Fünf Grüße und keine Mundart.** Hier standen einmal Schwäbisch, Fränkisch
 * und Österreichisch daneben, ausbuchstabiert bis zum Apostroph. Übrig sind
 * die Grüße, die tatsächlich fallen: „Hallo" und „Servus" zu jeder Zeit, dazu
 * je einer, der zur Tageszeit gehört — „Guten Morgen", „Mahlzeit", „Guten
 * Abend". Wer mittags „Guten Morgen" liest, fühlt sich ertappt; wer abends
 * „Mahlzeit" liest, wundert sich. Deshalb hängt der eigene Gruß an der Uhr,
 * und dazwischen bleibt es bei den beiden, die immer passen.
 *
 * Reine Daten und eine reine Funktion, kein React: die Auswahl hängt an Tag,
 * Uhrzeit und Person, an sonst nichts.
 */
import type { CalendarDay } from '@/lib/date';

/** Enthält `{name}` — der Vorname wird eingesetzt. */
const ALWAYS = ['Hallo {name}!', 'Servus {name}!'];

/**
 * Der Gruß, der nur zu einer Tageszeit passt — oder keiner.
 *
 * Halb elf statt zwölf für das Ende des Morgens: „Guten Morgen" um 11:45 klingt
 * nach Vorwurf. „Mahlzeit" gilt um die Mittagspause, nicht den ganzen Tag.
 * Und ab fünf ist Abend, weil die Gruppe sich um sechs trifft — wer kurz
 * vorher hereinschaut, ist auf dem Weg dorthin.
 */
function daytimeGreeting(minutes: number): string | null {
  if (minutes < 10 * 60 + 30) return 'Guten Morgen, {name}!';
  if (minutes >= 11 * 60 + 30 && minutes < 14 * 60) return 'Mahlzeit, {name}!';
  if (minutes >= 17 * 60) return 'Guten Abend, {name}!';
  return null;
}

const LINES = [
  'Schön, dass du da bist. Das steht bei dir an.',
  'Das hast du diese Woche vor dir.',
];

/**
 * Ein kleiner, stabiler Hash (djb2).
 *
 * Bewusst kein `Math.random`: die Begrüßung soll pro Tag feststehen. Ein
 * Zufallswert im Render wäre bei jeder Query-Aktualisierung ein anderer, und
 * der Gruß spränge unter dem Daumen weg.
 */
function hash(text: string): number {
  let value = 5381;

  for (let i = 0; i < text.length; i += 1) {
    value = ((value << 5) + value + text.charCodeAt(i)) | 0;
  }

  return Math.abs(value);
}

/**
 * Welche Begrüßung heute dransteht.
 *
 * `seed` ist die eigene Personen-Id: sonst läsen alle neun am selben Tag
 * denselben Satz, und aus der Abwechslung würde ein Kalenderblatt. Innerhalb
 * eines Tages wechselt der Gruß nur mit der Tageszeit — aus „Guten Morgen"
 * wird mittags „Mahlzeit" oder eben „Hallo".
 */
export function greetingOf(
  day: CalendarDay,
  minutes: number,
  seed: string,
  name: string,
): { hallo: string; zeile: string } {
  const own = daytimeGreeting(minutes);
  const choices = own ? [own, ...ALWAYS] : ALWAYS;
  const pick = hash(day + seed);

  return {
    hallo: (choices[pick % choices.length] as string).replace('{name}', name),
    zeile: LINES[pick % LINES.length] as string,
  };
}
