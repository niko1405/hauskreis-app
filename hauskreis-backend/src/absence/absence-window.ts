/** One stretch of time somebody is away. Both ends inclusive. */
export interface AbsenceWindow {
  personId: string;
  startDate: Date;
  endDate: Date;
}

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
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}
