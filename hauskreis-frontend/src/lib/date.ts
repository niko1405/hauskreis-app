/**
 * Kalendertage und Zeitpunkte — sauber getrennt, so wie die API sie liefert.
 *
 * Ein Tag ist `2026-08-11` und hat keine Uhrzeit. `new Date('2026-08-11')`
 * macht daraus UTC-Mitternacht; lokal formatiert wird daraus westlich von UTC
 * der **10. August**. Deshalb wird hier nie ein Tag-String an `new Date`
 * gereicht, sondern in seine drei Zahlen zerlegt.
 *
 * Zeitpunkte (`createdAt`, `updatedAt`, `sentAt`) sind volle ISO-Stempel und
 * dürfen ganz normal geparst werden — dafür gibt es unten `formatTimestamp`.
 */

/** Ein Kalendertag in der Form `YYYY-MM-DD`. */
export type CalendarDay = string;

const WEEKDAY_SHORT = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
const WEEKDAY_LONG = new Intl.DateTimeFormat('de-DE', { weekday: 'long' });
const DAY_MONTH = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'long',
});
const DAY_MONTH_SHORT = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'short',
});
const FULL = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const MONTH_YEAR = new Intl.DateTimeFormat('de-DE', {
  month: 'long',
  year: 'numeric',
});
const TIMESTAMP = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** `2026-08-11` → lokale Mitternacht des 11. August. */
export function parseDay(day: CalendarDay): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, date ?? 1);
}

/** Umgekehrt: ein lokales Datum als `YYYY-MM-DD`, ohne Zeitzonen-Umweg. */
export function toDay(date: Date): CalendarDay {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function today(): CalendarDay {
  return toDay(new Date());
}

export function addDays(day: CalendarDay, amount: number): CalendarDay {
  const date = parseDay(day);
  date.setDate(date.getDate() + amount);
  return toDay(date);
}

export function addMonths(day: CalendarDay, amount: number): CalendarDay {
  const date = parseDay(day);
  date.setMonth(date.getMonth() + amount);
  return toDay(date);
}

/** Ganze Tage von `from` bis `to`; negativ, wenn `to` davor liegt. */
export function daysBetween(from: CalendarDay, to: CalendarDay): number {
  const ms = parseDay(to).getTime() - parseDay(from).getTime();
  return Math.round(ms / 86_400_000);
}

export function isPast(day: CalendarDay): boolean {
  return daysBetween(today(), day) < 0;
}

export function isToday(day: CalendarDay): boolean {
  return day === today();
}

/** Montag der Woche, in der `day` liegt. */
export function startOfWeek(day: CalendarDay): CalendarDay {
  const date = parseDay(day);
  const weekday = (date.getDay() + 6) % 7; // Montag = 0
  date.setDate(date.getDate() - weekday);
  return toDay(date);
}

export function startOfMonth(day: CalendarDay): CalendarDay {
  const date = parseDay(day);
  date.setDate(1);
  return toDay(date);
}

export function endOfMonth(day: CalendarDay): CalendarDay {
  const date = parseDay(day);
  date.setMonth(date.getMonth() + 1, 0);
  return toDay(date);
}

// ── Anzeige ─────────────────────────────────────────────────────────────────

/** `Di., 11. Aug.` — die übliche Form auf Karten. */
export function formatDay(day: CalendarDay): string {
  const date = parseDay(day);
  return `${WEEKDAY_SHORT.format(date)}, ${DAY_MONTH_SHORT.format(date)}`;
}

/** `11. August` */
export function formatDayMonth(day: CalendarDay): string {
  return DAY_MONTH.format(parseDay(day));
}

/** `11. August 2026` */
export function formatDayFull(day: CalendarDay): string {
  return FULL.format(parseDay(day));
}

/** `Dienstag` */
export function formatWeekday(day: CalendarDay): string {
  return WEEKDAY_LONG.format(parseDay(day));
}

/** `August 2026` */
export function formatMonth(day: CalendarDay): string {
  return MONTH_YEAR.format(parseDay(day));
}

/** `3. – 17. August` bzw. `28. Juli – 11. August`, je nach Monatswechsel. */
export function formatDayRange(from: CalendarDay, to: CalendarDay): string {
  const start = parseDay(from);
  const end = parseDay(to);
  const sameMonth =
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear();

  if (sameMonth) {
    return `${start.getDate()}. – ${DAY_MONTH.format(end)}`;
  }
  return `${DAY_MONTH.format(start)} – ${DAY_MONTH.format(end)}`;
}

/**
 * `heute`, `morgen`, `in 3 Tagen`, `vor 2 Wochen` — für Countdown-Zeilen.
 * Bewusst grob: „in 12 Tagen" hilft niemandem mehr als „in 2 Wochen".
 */
export function formatRelativeDay(day: CalendarDay): string {
  const diff = daysBetween(today(), day);

  if (diff === 0) return 'heute';
  if (diff === 1) return 'morgen';
  if (diff === -1) return 'gestern';

  if (diff > 0) {
    if (diff < 7) return `in ${diff} Tagen`;
    const weeks = Math.round(diff / 7);
    return weeks === 1 ? 'in einer Woche' : `in ${weeks} Wochen`;
  }

  const past = Math.abs(diff);
  if (past < 7) return `vor ${past} Tagen`;
  const weeks = Math.round(past / 7);
  if (weeks < 9) return weeks === 1 ? 'vor einer Woche' : `vor ${weeks} Wochen`;
  const months = Math.round(past / 30);
  return months === 1 ? 'vor einem Monat' : `vor ${months} Monaten`;
}

/** Für `createdAt`, `updatedAt`, `sentAt` — echte Zeitpunkte. */
export function formatTimestamp(iso: string): string {
  return TIMESTAMP.format(new Date(iso));
}
