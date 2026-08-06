/**
 * Pure date helpers for the meeting schedule.
 *
 * Everything works on UTC midnight so a calendar date never drifts across a
 * timezone boundary — Prisma stores these as `@db.Date`, which has no time part.
 */

/** Tuesday, as returned by `Date.getUTCDay()`. */
const TUESDAY = 2;

/** Strips the time part, keeping the calendar date in UTC. */
export function toUtcDate(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function addDays(date: Date, days: number): Date {
  const result = toUtcDate(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * The first Tuesday strictly after `from`. Passing a Tuesday returns the
 * following week, so a meeting is never generated for a day that is already
 * under way.
 */
export function nextTuesdayAfter(from: Date): Date {
  const base = toUtcDate(from);
  const daysUntilTuesday = (TUESDAY - base.getUTCDay() + 7) % 7 || 7;
  return addDays(base, daysUntilTuesday);
}

/** The next `count` Tuesdays, starting with the first one after `from`. */
export function upcomingTuesdays(from: Date, count: number): Date[] {
  const dates: Date[] = [];
  let cursor = nextTuesdayAfter(from);

  for (let i = 0; i < count; i += 1) {
    dates.push(cursor);
    cursor = addDays(cursor, 7);
  }

  return dates;
}

/**
 * True when no further Tuesday falls in the same month — i.e. this is the last
 * regular meeting before the month ends, which is the Lobpreis/Gebet slot.
 */
export function isLastTuesdayOfMonth(date: Date): boolean {
  const base = toUtcDate(date);
  return addDays(base, 7).getUTCMonth() !== base.getUTCMonth();
}

/**
 * Liegt der Abend hinter uns?
 *
 * Beide Seiten auf Mitternacht UTC geschnitten, weil `meeting.date` ein
 * Kalendertag ist: der heutige Abend zählt bis zum Ende des Tages als kommend,
 * sonst wäre ein Termin ab 00:01 „vergangen" und jede Absage stumm.
 *
 * Stand als Modulfunktion in `meeting.service.ts`, bis die Rechteprüfung sie
 * ebenfalls brauchte — sie ist reine Datumslogik und gehört zum Rest davon.
 */
export function isPast(date: Date): boolean {
  return toUtcDate(date) < toUtcDate(new Date());
}

/**
 * Die drei `where`-Fragmente für „wann findet dieser Termin statt".
 *
 * **Ein Termin ist ein Zeitraum, kein Tag.** Eine Freizeit von Freitag bis
 * Sonntag ist eine Zeile mit `date` am Freitag; wer den Monat abfragt, der am
 * Samstag beginnt, bekam sie ohne das hier nicht zu sehen — obwohl sie an
 * diesem Samstag stattfindet. Genau das ist im Kalender passiert: ein Termin
 * über den Monatswechsel stand nur im ersten Monat, und in der zweiten Hälfte
 * fehlte er.
 *
 * Ein eintägiger Termin hat `endDate = null`; dann zählt sein Startdatum als
 * Ende, daher in beiden Fragmenten die zwei Zweige.
 *
 * Als Bausteine und nicht als eine Funktion, weil sie sich unterschiedlich
 * kombinieren: die Terminliste legt Bereich und Zeitfenster übereinander, die
 * Prüfung auf einen zweiten Termin mitten in einem mehrtägigen braucht beides
 * zusammen.
 */
export function notFinishedBefore(day: Date) {
  return {
    OR: [{ endDate: null, date: { gte: day } }, { endDate: { gte: day } }],
  };
}

/** Vorbei — und zwar ganz, nicht nur angefangen. */
export function finishedBefore(day: Date) {
  return {
    OR: [{ endDate: null, date: { lt: day } }, { endDate: { lt: day } }],
  };
}

/** Berührt das Fenster `[from, to]` an mindestens einem Tag. */
export function overlapping(from: Date, to: Date) {
  return { AND: [notFinishedBefore(from), { date: { lte: to } }] };
}
