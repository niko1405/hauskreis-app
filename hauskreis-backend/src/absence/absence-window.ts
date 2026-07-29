/** One stretch of time somebody is away. Both ends inclusive. */
export interface AbsenceWindow {
  personId: string;
  startDate: Date;
  endDate: Date;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Answers "is this person away on this date" for a whole set of periods.
 *
 * Built once per ranking run rather than queried per person and date: the
 * suggestion engine replays years of history, and a database round trip per
 * evening would dominate everything else it does.
 *
 * Overlapping periods need no special handling — a date inside any of them
 * counts, which is exactly the union the group means by "weg".
 */
export class AbsenceCalendar {
  private readonly byPerson = new Map<string, AbsenceWindow[]>();

  constructor(windows: readonly AbsenceWindow[]) {
    for (const window of windows) {
      const existing = this.byPerson.get(window.personId);

      if (existing) {
        existing.push(window);
      } else {
        this.byPerson.set(window.personId, [window]);
      }
    }
  }

  isAway(personId: string, date: Date): boolean {
    const windows = this.byPerson.get(personId);

    if (!windows) {
      return false;
    }

    const day = startOfUtcDay(date).getTime();

    return windows.some(
      (window) =>
        startOfUtcDay(window.startDate).getTime() <= day &&
        day <= startOfUtcDay(window.endDate).getTime(),
    );
  }

  /** True when every one of them is away — used for shared homes. */
  areAllAway(personIds: readonly string[], date: Date): boolean {
    return (
      personIds.length > 0 &&
      personIds.every((personId) => this.isAway(personId, date))
    );
  }

  /**
   * True when the person is away for *every* day of the range.
   *
   * The prayer buddy rotation asks this: being away for a few days of a
   * fortnight is no reason to leave somebody out, being away for all of it is.
   */
  isAwayThroughout(personId: string, from: Date, to: Date): boolean {
    const windows = this.byPerson.get(personId);

    if (!windows) {
      return false;
    }

    for (
      let day = startOfUtcDay(from).getTime();
      day <= startOfUtcDay(to).getTime();
      day += MS_PER_DAY
    ) {
      if (!this.isAway(personId, new Date(day))) {
        return false;
      }
    }

    return true;
  }

  get isEmpty(): boolean {
    return this.byPerson.size === 0;
  }
}

/** Every date in an inclusive range, at midnight UTC. */
export function datesInRange(from: Date, to: Date): Date[] {
  const dates: Date[] = [];
  const last = startOfUtcDay(to).getTime();

  for (
    let day = startOfUtcDay(from).getTime();
    day <= last;
    day += MS_PER_DAY
  ) {
    dates.push(new Date(day));
  }

  return dates;
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}
