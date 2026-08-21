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

  /**
   * Derselbe Kalender, aber an **einem** Abend sticht die ausdrückliche Zusage.
   *
   * „Doch, ich komme" gewinnt gegen einen pauschalen Zeitraum — das galt
   * überall sonst schon (`AbsenceSyncService` fasst eine `SELF`-Zeile nie an,
   * und die Hilfe sagt es genauso), nur bei der Frage „wer kann eine Rolle
   * übernehmen" nicht: Dort wurde der Zeitraum getrennt gefragt und schlug die
   * eigene Antwort. Wer aus dem Urlaub heraus wieder zusagte, fiel weiter aus
   * jeder Vorschlagsliste — und der Server hätte ihn auch abgelehnt.
   *
   * **Nur an diesem einen Abend**, und das ist der Grund für den Parameter: Die
   * Rangfolge spielt die ganze Historie durch und fragt für jeden vergangenen
   * Abend, wer damals weg war. Eine Zusage von heute darf darüber nichts sagen.
   */
  exceptOn(date: Date, personIds: ReadonlySet<string>): AbsenceCalendar {
    if (personIds.size === 0) return this;

    return new AnsweredCalendar(this, startOfUtcDay(date).getTime(), personIds);
  }
}

/**
 * Steht hier und nicht als Zweig in `isAway`: Der Normalfall — die Historie —
 * soll die Ausnahme nicht bei jedem der Tausenden Aufrufe mitprüfen müssen.
 */
class AnsweredCalendar extends AbsenceCalendar {
  constructor(
    private readonly base: AbsenceCalendar,
    private readonly day: number,
    private readonly attending: ReadonlySet<string>,
  ) {
    // Die Fenster liegen im `base`; `super` bekommt deshalb keine.
    super([]);
  }

  override isAway(personId: string, date: Date): boolean {
    if (
      startOfUtcDay(date).getTime() === this.day &&
      this.attending.has(personId)
    ) {
      return false;
    }

    return this.base.isAway(personId, date);
  }
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}
