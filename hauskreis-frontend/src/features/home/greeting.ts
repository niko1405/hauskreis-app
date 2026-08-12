/**
 * Die Begrüßung auf dem Startbildschirm.
 *
 * „Hallo Niko! Schön, dass du da bist." stand dort jeden Tag, und ein Satz, den
 * man jeden Tag liest, liest man irgendwann nicht mehr. Also mehrere — und
 * nicht nur auf Hochdeutsch: die Gruppe redet nicht wie eine Bedienungsanleitung.
 *
 * Der Ton soll warm klingen und nicht wie eine Parodie. Kurze, gebräuchliche
 * Grüße, wie sie tatsächlich fallen, keine ausbuchstabierte Mundart.
 *
 * Reine Daten und eine reine Funktion, kein React: die Auswahl hängt an Tag,
 * Uhrzeit und Person, an sonst nichts.
 */
import type { CalendarDay } from '@/lib/date';

type Daytime = 'morgen' | 'tag' | 'abend';

interface Greeting {
  /** Nur zur Orientierung beim Lesen der Liste. */
  ton: 'hochdeutsch' | 'österreichisch' | 'schwäbisch' | 'fränkisch';
  /** Enthält `{name}` — der Vorname wird eingesetzt. */
  hallo: Record<Daytime, string>;
  zeile: string;
}

const GREETINGS: Greeting[] = [
  {
    ton: 'hochdeutsch',
    hallo: {
      morgen: 'Guten Morgen, {name}!',
      tag: 'Hallo {name}!',
      abend: 'Schönen Abend, {name}!',
    },
    zeile: 'Schön, dass du da bist. Das steht bei dir an.',
  },
  {
    ton: 'hochdeutsch',
    hallo: {
      morgen: 'Moin {name}!',
      tag: 'Hey {name}!',
      abend: 'N’Abend, {name}!',
    },
    zeile: 'Das hast du diese Woche vor dir.',
  },
  {
    ton: 'österreichisch',
    hallo: {
      morgen: 'Guat’n Morgn, {name}!',
      tag: 'Servus {name}!',
      abend: 'Schön’n Obend, {name}!',
    },
    zeile: 'Fein, dass du da bist. Des steht bei dir an.',
  },
  {
    ton: 'schwäbisch',
    hallo: {
      morgen: 'Guada Morga, {name}!',
      tag: 'Grüß di, {name}!',
      abend: 'N’Obed, {name}!',
    },
    zeile: 'Schee, dass d’ do bisch. Des isch dei Wochaprogramm.',
  },
  {
    ton: 'fränkisch',
    hallo: {
      morgen: 'Guudn Morgn, {name}!',
      tag: 'Servusla, {name}!',
      abend: 'Guudn Ohmd, {name}!',
    },
    zeile: 'Schee, dassd du do bist. Des schdehd bei dir o.',
  },
];

/**
 * Die Tageszeit, grob und großzügig geschnitten.
 *
 * Halb elf statt zwölf für das Ende des Morgens: „Guten Morgen" um 11:45 klingt
 * nach Vorwurf. Und ab fünf ist Abend, weil die Gruppe sich um sechs trifft —
 * wer kurz vorher hereinschaut, ist auf dem Weg dorthin.
 */
function daytimeOf(minutes: number): Daytime {
  if (minutes < 10 * 60 + 30) return 'morgen';
  if (minutes < 17 * 60) return 'tag';
  return 'abend';
}

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
 * denselben Satz, und aus der Abwechslung würde ein Kalenderblatt.
 */
export function greetingOf(
  day: CalendarDay,
  minutes: number,
  seed: string,
  name: string,
): { hallo: string; zeile: string } {
  const greeting = GREETINGS[hash(day + seed) % GREETINGS.length] as Greeting;

  return {
    hallo: greeting.hallo[daytimeOf(minutes)].replace('{name}', name),
    zeile: greeting.zeile,
  };
}
