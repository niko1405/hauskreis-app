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
