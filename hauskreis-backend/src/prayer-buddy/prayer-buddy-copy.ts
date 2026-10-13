/**
 * Was die beiden Nachrichten über eine Gebetsrunde gemeinsam sagen — „neue
 * Gebetsbuddys" zum Anfang und „Halbzeit" in der Mitte.
 *
 * Eine Datei und nicht zwei Kopien: Beide nennen das Ende der Runde und wer für
 * wen betet. Stünde `circleFor` zweimal da, hieße das Paar beim Ankündigen
 * „füreinander" und zur Halbzeit irgendwann etwas anderes.
 */

/** Whole days from `from` to `to`; negative when `to` lies earlier. */
function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/**
 * Wie viele Tage nach der Halbzeit die Erinnerung noch kommt.
 *
 * Ein verpasster Morgen (Server aus, Push noch nicht eingerichtet) wird so zu
 * einer verspäteten Nachricht statt zu keiner. Länger nicht: Eine „Halbzeit",
 * die drei Tage vor dem Ende ankommt, ist keine mehr.
 */
const HALFTIME_WINDOW_DAYS = 2;

/**
 * Ob heute die Halbzeit dieser Runde ist — oder ein Tag kurz danach, an dem
 * sie noch nachgeholt werden darf.
 *
 * Halbzeit ist der Anfang plus die Hälfte der Tage, abgerundet: bei zwei Wochen
 * von Dienstag bis Montag der Dienstag dazwischen, bei einer Woche der Freitag.
 * **Nie am letzten Tag**: Dort ist sie keine Erinnerung mehr, sondern ein
 * Abschied, und am nächsten Morgen kommen ohnehin die neuen Buddys.
 */
export function isHalftime(
  periodStart: string,
  periodEnd: string,
  today: Date,
): boolean {
  const start = day(periodStart);
  const end = day(periodEnd);
  const days = daysBetween(start, end) + 1;

  // Eine Runde aus einem oder zwei Tagen hat keine Mitte, an die man erinnern
  // könnte — sie ist vorbei, bevor die Nachricht etwas bedeutet.
  if (days < 3) return false;

  const sinceHalftime = daysBetween(start, today) - Math.floor(days / 2);

  return (
    sinceHalftime >= 0 &&
    sinceHalftime <= HALFTIME_WINDOW_DAYS &&
    daysBetween(today, end) > 0
  );
}

const dateFormat = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

export function formatDate(iso: string): string {
  return dateFormat.format(day(iso));
}

/**
 * Wer für wen — aus der Sicht der Person auf `position`.
 *
 * Beim **Paar** bleibt es schlicht: „betest du mit Anna". Die Richtung trägt
 * dort keine Information — ihr betet füreinander —, und sie auszuschreiben wäre
 * eine Unterscheidung ohne Unterschied. Dann liest man sie beim Trio auch nicht
 * mehr, und dort sagt sie etwas.
 */
export function circleFor(
  members: readonly { name: string }[],
  position: number,
): string {
  const n = members.length;

  if (n <= 1) {
    return 'betest du allein';
  }

  const fuer = members[(position + 1) % n].name;

  if (n === 2) {
    return `betest du mit ${fuer}`;
  }

  const vonWem = members[(position - 1 + n) % n].name;

  return `betest du für ${fuer} — ${vonWem} betet für dich`;
}
