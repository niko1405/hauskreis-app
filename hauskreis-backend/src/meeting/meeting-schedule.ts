/**
 * Pure date helpers for the meeting schedule.
 *
 * Everything works on UTC midnight so a calendar date never drifts across a
 * timezone boundary — Prisma stores these as `@db.Date`, which has no time part.
 *
 * **Ein gespeicherter Tag und der heutige Tag sind zwei verschiedene Fragen**,
 * und lange beantwortete `toUtcDate` beide. Die erste beantwortet sie richtig;
 * für die zweite gibt es jetzt `currentDay`.
 */
import { zoneOffsetMinutes } from '../common/time/local-evening';

/** Strips the time part, keeping the calendar date in UTC. */
export function toUtcDate(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/**
 * Welchen Tag haben wir — in der Zone der Gruppe, als UTC-Mitternacht.
 *
 * `toUtcDate(new Date())` beantwortete das bisher, und zwar falsch: es las die
 * UTC-Felder eines *Zeitpunkts*. Um halb eins nachts ist in UTC noch gestern,
 * also galt der Termin von gestern noch als kommend, während die App ihn schon
 * als „Vorbei" auswies. Dasselbe Fenster verbot jede Nacht zwischen null und
 * zwei das Abhaken der Lieder vom Vorabend.
 *
 * Die Zone ist ein **Pflichtargument**. Ein Vorgabewert wäre genau die Falle,
 * die hier zugeht: eine vergessene Stelle rechnete still in Berlin weiter, und
 * niemand merkte es.
 */
export function currentDay(zone: string, now: Date = new Date()): Date {
  return toUtcDate(
    new Date(now.getTime() + zoneOffsetMinutes(now, zone) * 60_000),
  );
}

export function addDays(date: Date, days: number): Date {
  const result = toUtcDate(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Der erste `weekday` **echt nach** `from`. Fällt `from` selbst darauf, kommt
 * die Folgewoche — so entsteht nie ein Termin für einen Tag, der schon läuft.
 *
 * `weekday` zählt wie `Date.getUTCDay()`: 0 = Sonntag … 6 = Samstag. Er stand
 * hier als `const TUESDAY = 2` und im Namen der Funktion, was für die eine
 * Gruppe stimmte, für die das geschrieben wurde. Jetzt kommt er aus
 * `MeetingScheduleConfig`.
 */
export function nextWeekdayAfter(from: Date, weekday: number): Date {
  const base = toUtcDate(from);
  const daysUntil = (weekday - base.getUTCDay() + 7) % 7 || 7;
  return addDays(base, daysUntil);
}

/** Die nächsten `count` Termine dieses Wochentags, ab dem ersten nach `from`. */
export function upcomingWeekdays(
  from: Date,
  weekday: number,
  count: number,
): Date[] {
  const dates: Date[] = [];
  let cursor = nextWeekdayAfter(from, weekday);

  for (let i = 0; i < count; i += 1) {
    dates.push(cursor);
    cursor = addDays(cursor, 7);
  }

  return dates;
}

/**
 * True when no further meeting of the same weekday falls in the same month —
 * i.e. this is the last regular evening before the month ends, which is the
 * Lobpreis/Gebet slot.
 *
 * War schon immer wochentagsunabhängig gerechnet („+7 Tage, anderer Monat?"),
 * nur der Name behauptete etwas anderes.
 */
export function isLastOfMonth(date: Date): boolean {
  const base = toUtcDate(date);
  return addDays(base, 7).getUTCMonth() !== base.getUTCMonth();
}

/**
 * Liegt der Abend hinter uns?
 *
 * Tag gegen Tag, weil `meeting.date` ein Kalendertag ist: der heutige Abend
 * zählt bis zum Ende des Tages als kommend, sonst wäre ein Termin ab 00:01
 * „vergangen" und jede Absage stumm.
 *
 * Welcher Tag „heute" ist, entscheidet `currentDay` — und dafür braucht es die
 * Zone der Gruppe. Wer hier nur einen Termin in der Hand hat, holt sie über
 * `GroupClockService`.
 *
 * Stand als Modulfunktion in `meeting.service.ts`, bis die Rechteprüfung sie
 * ebenfalls brauchte — sie ist reine Datumslogik und gehört zum Rest davon.
 */
export function isPast(
  date: Date,
  zone: string,
  now: Date = new Date(),
): boolean {
  return toUtcDate(date) < currentDay(zone, now);
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
