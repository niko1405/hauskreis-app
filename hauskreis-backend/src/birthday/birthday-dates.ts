/**
 * Wann jemand das nächste Mal Geburtstag hat.
 *
 * Reine Funktionen, kein Prisma, keine Uhr — die Gegenwart kommt als Argument
 * herein. Dieselbe Bauart wie `meeting-schedule.ts`, und aus demselben Grund:
 * Diese Rechnung steckt in Schleifen und Filtern, und ein `await` darin wäre
 * ein `await` an jedem Aufrufer.
 *
 * **Alle Daten sind UTC-Mitternacht.** Das ist im ganzen Projekt die Form für
 * einen Kalendertag (`@db.Date`, `currentDay`): kein Zeitpunkt, sondern ein
 * Tag. Welcher Tag „heute" ist, entscheidet die Zone der Gruppe — das rechnet
 * `GroupClockService` aus, bevor hier irgendetwas verglichen wird.
 */

/** Ein Kalendertag als UTC-Mitternacht. */
function dayUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Der Geburtstag in diesem Jahr — mit der Sonderregel für den 29. Februar.
 *
 * **Wer am 29. Februar geboren ist, feiert in normalen Jahren am 28.** Nicht am
 * 1. März, obwohl beides vertretbar wäre: Der 28. liegt noch im richtigen
 * Monat, und wer „Ende Februar" sagt, meint den Februar. Vor allem aber ist es
 * die Variante, bei der die Reihenfolge im Jahr stimmt — am 1. März stünde er
 * hinter allen, die tatsächlich Anfang März geboren sind, und die Rotation
 * („du bekommst den, der als nächstes dran ist") zöge daraus falsche Schlüsse.
 *
 * Ohne die Regel entstünde aus `Date.UTC(2027, 1, 29)` stillschweigend der
 * 1. März — JavaScript rechnet über den Monatsrand hinaus, ohne sich zu
 * beschweren. Ein Fehler, den man erst 2027 gesehen hätte.
 */
export function birthdayInYear(birthdate: Date, year: number): Date {
  const month = birthdate.getUTCMonth() + 1;
  const day = birthdate.getUTCDate();

  if (month === 2 && day === 29 && !isLeapYear(year))
    return dayUtc(year, 2, 28);

  return dayUtc(year, month, day);
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Der nächste Geburtstag ab heute — **heute eingeschlossen**.
 *
 * Wer heute Geburtstag hat, hat ihn heute und nicht erst in einem Jahr. Das ist
 * genau der Grund für `>=` statt `>`: Der ganze Tag über soll die Karte oben
 * stehen, nicht bis Mitternacht und dann weg. Erst ab morgen zählt der nächste.
 */
export function nextBirthday(birthdate: Date, today: Date): Date {
  const thisYear = birthdayInYear(birthdate, today.getUTCFullYear());
  if (thisYear.getTime() >= today.getTime()) return thisYear;

  return birthdayInYear(birthdate, today.getUTCFullYear() + 1);
}

/** Wie viele Tage noch. Negativ, wenn der Tag vorbei ist. */
export function daysUntil(date: Date, today: Date): number {
  return Math.round((date.getTime() - today.getTime()) / 86_400_000);
}

/**
 * Wie alt jemand an diesem Geburtstag wird.
 *
 * `null`, wenn das Geburtsjahr keins ist, mit dem sich rechnen lässt — im
 * Profil darf man den Tag eintragen, ohne sein Alter zu verraten, und manche
 * tragen dafür ein Jahr wie 1900 ein. Ab hundert Jahren gehen wir davon aus,
 * dass die Zahl nicht gemeint war.
 */
export function ageAt(birthdate: Date, occasion: Date): number | null {
  const age = occasion.getUTCFullYear() - birthdate.getUTCFullYear();
  return age > 0 && age < 100 ? age : null;
}

/**
 * Ordnet Geburtstage innerhalb eines Jahres — Monat, dann Tag.
 *
 * **Ohne Jahr**, und das ist der Punkt: Die Rotation fragt „wer kommt als
 * nächstes dran", und diese Reihenfolge ist ein Kreis, der sich jedes Jahr
 * gleich schließt. Nach dem nächsten Vorkommen zu sortieren ergäbe denselben
 * Kreis, nur an einer anderen Stelle aufgeschnitten — und der änderte sich mit
 * jedem Geburtstag, der vorbeigeht.
 */
export function compareInYear(a: Date, b: Date): number {
  return a.getUTCMonth() - b.getUTCMonth() || a.getUTCDate() - b.getUTCDate();
}
