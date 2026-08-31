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

export interface MeetingDateOptions {
  /** Heute, im Kalender der Gruppe. */
  from: Date;
  /** 0 = Sonntag … 6 = Samstag. */
  weekday: number;
  /** Wie viele Termine die Reihe umfasst. */
  count: number;
  /** Wochen zwischen zwei Terminen. 1 = jede Woche. */
  everyWeeks: number;
  /**
   * Der späteste selbst erzeugte Abend — der Taktschlag.
   *
   * Nur der gibt bei einem Abstand über einer Woche an, *welche* Woche trifft.
   * Ein `CUSTOM`-Termin taugt dafür nicht: Ein Geburtstag am Samstag verschöbe
   * den Takt der Dienstage.
   */
  anchor?: Date | null;
}

/**
 * Die nächsten `count` Termine des Rhythmus, alle nach `from`.
 *
 * **Warum es einen Anker braucht.** Solange jede Woche ein Termin war, genügte
 * „der nächste Dienstag, dann immer sieben Tage weiter" — jeder Lauf kam auf
 * dieselbe Reihe. Bei vierzehn Tagen nicht mehr: Der Lauf am Mittwoch nimmt
 * den Dienstag darauf, der Lauf eine Woche später den Dienstag danach, und
 * beide Reihen liegen um sieben Tage versetzt. Nach zwei Nächten stünde wieder
 * jede Woche ein Termin — mit einer Einstellung, die „alle zwei Wochen" sagt.
 *
 * Der Takt muss also aus dem Kalender kommen und nicht aus dem Zufall, an
 * welchem Tag der Lauf startet. Passt der Anker nicht zum eingestellten
 * Wochentag, wird er verworfen und die Reihe fängt neu an: Genau das ist der
 * Fall „jemand hat den Wochentag umgestellt" — die alten Termine laufen aus,
 * der neue Takt beginnt beim nächsten passenden Tag.
 */
export function upcomingMeetingDates(options: MeetingDateOptions): Date[] {
  const { from, weekday, count, everyWeeks, anchor } = options;

  const step = Math.max(1, everyWeeks) * 7;
  const base = toUtcDate(from);
  const takt = anchor ? toUtcDate(anchor) : null;

  // Vom Anker aus vorwärts, bis wir hinter `from` sind — sonst vom nächsten
  // passenden Wochentag. `nextWeekdayAfter` liefert immer einen Tag **nach**
  // `from`, der heutige Abend zählt also nicht mehr als „kommend".
  let cursor =
    takt && takt.getUTCDay() === weekday
      ? weiterBis(takt, base, step)
      : nextWeekdayAfter(base, weekday);

  const dates: Date[] = [];
  for (let i = 0; i < count; i += 1) {
    dates.push(cursor);
    cursor = addDays(cursor, step);
  }

  return dates;
}

/** Der erste Termin der Reihe, der echt hinter `after` liegt. */
function weiterBis(anchor: Date, after: Date, step: number): Date {
  let cursor = anchor;
  while (cursor <= after) cursor = addDays(cursor, step);
  return cursor;
}

/**
 * True when no further meeting falls in the same month — i.e. this is the last
 * regular evening before the month ends, which is the Lobpreis/Gebet slot.
 *
 * War schon immer wochentagsunabhängig gerechnet („+7 Tage, anderer Monat?"),
 * nur der Name behauptete etwas anderes.
 *
 * Der Abstand gehört seit dem einstellbaren Rhythmus dazu: „danach kommt keiner
 * mehr in diesem Monat" ist bei vierzehn Tagen ein anderer Abend als bei
 * sieben. Mit der festen Sieben hätte die Regel bei jedem anderen Abstand
 * schlicht den falschen Termin markiert.
 */
export function isLastOfMonth(date: Date, everyWeeks = 1): boolean {
  const base = toUtcDate(date);
  const step = Math.max(1, everyWeeks) * 7;
  return addDays(base, step).getUTCMonth() !== base.getUTCMonth();
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
 * Ein Termin, so weit man ihn braucht, um zu wissen, wann er zu Ende ist.
 *
 * `endDate` ist optional **und** nullbar: Aufrufer, die einen Termin aus der
 * Datenbank in der Hand halten, geben ihn ganz herein; die wenigen, die nur
 * einen Tag kennen, geben `{ date }`.
 */
export interface MeetingSpan {
  date: Date;
  endDate?: Date | null;
}

/** Der letzte Tag eines Termins — bei einem eintägigen sein einziger. */
export function lastDay(span: MeetingSpan): Date {
  return span.endDate ?? span.date;
}

/**
 * Liegt dieser Termin hinter uns — **ganz**, nicht nur angefangen?
 *
 * Die Fassung von `isPast` für einen Termin statt für einen Tag, und der
 * Unterschied ist eine Freizeit von Freitag bis Sonntag: Am Samstag war ihr
 * `date` vorbei, sie selbst aber nicht. Die Listen-Abfragen wussten das seit
 * jeher (`finishedBefore` unten prüft dieselbe Bedingung); die punktuellen
 * Vergleiche lasen dagegen nur `meeting.date` und erklärten den zweiten Tag
 * einer laufenden Freizeit zur Vergangenheit — Lieder waren plötzlich für alle
 * abhakbar, Rollen ließen sich nicht mehr freigeben, der Inhalt eines Themas
 * stand offen.
 *
 * Zwei Funktionen und nicht eine mit optionalem Feld: `isPast` beantwortet eine
 * Frage über einen **Kalendertag** (den es auch ohne Termin gibt, etwa in
 * `topic-session.service.ts`), diese eine über einen **Termin**.
 */
export function spanIsPast(
  span: MeetingSpan,
  zone: string,
  now: Date = new Date(),
): boolean {
  return isPast(lastDay(span), zone, now);
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
