import type { DeferralReason, HomeFacts } from './host-ranking';

/**
 * The shared vocabulary of the suggestion engine.
 *
 * Host, Thema und Song folgen fachlich demselben Muster ("wer war am längsten
 * nicht dran"). Statt das dreimal zu bauen, normalisieren die Adapter ihre
 * Zuweisungen auf `RoleAssignmentEvent` — die Ranking-Logik kennt danach nur
 * noch Personen, Rollen und Daten, nicht mehr Termine, Themen oder Songs.
 */

/**
 * Kommt aus der Datenbank, seit sich die Benachrichtigungs-Historie merken
 * muss, *welche* Rolle jemand bekommen hat. Vorher stand die Liste hier als
 * eigenes Objekt — zwei Aufschriebe derselben drei Werte, die auseinanderlaufen
 * können. Eine Rolle zu ergänzen heißt weiterhin: einen Adapter schreiben, das
 * Ranking bleibt unberührt.
 */
import { AssignmentRole } from '../../generated/prisma/enums';

export { AssignmentRole };

/** One person did (or will do) one job on one date. */
export interface RoleAssignmentEvent {
  personId: string;
  role: AssignmentRole;
  /** The meeting date. UTC midnight, matching Prisma's `@db.Date`. */
  date: Date;
  /**
   * Ties several evenings together into one job. A topic spanning three
   * meetings emits three events with the same key and counts once — CLAUDE.md
   * §5: ein mehrteiliges Thema zählt wie ein einzelner Slot.
   *
   * Omitted where one evening is one job, as with hosting.
   */
  slotKey?: string;
}

export interface EligiblePerson {
  id: string;
  name: string;
  /** Nur zum Durchreichen: die Vorschlagsliste zeigt Gesichter. */
  photoUpdatedAt: Date | null;
}

/** A job the person has already agreed to, still ahead of the target date. */
export interface UpcomingCommitment {
  role: AssignmentRole;
  /** ISO date (`YYYY-MM-DD`). */
  date: string;
  /**
   * Dieser Dienst liegt am **selben Abend**, für den gerade eingeteilt wird.
   *
   * Der wichtigste Fall der ganzen Liste und der einzige, den ein Datum nicht
   * ausdrückt: „hat am 11. August schon Thema" beim Einteilen für den
   * 11. August lässt den Leser rechnen, ob das derselbe Abend ist. Hier
   * entschieden und nicht im Frontend, damit „derselbe Abend" eine Regel
   * bleibt und nicht zwei — eine mit `Date`, eine mit Zeichenketten.
   */
  thisEvening: boolean;
}

/**
 * The facts behind a suggestion. CLAUDE.md verlangt Nachvollziehbarkeit statt
 * Blackbox: die UI zeigt diese Werte direkt an, damit erkennbar ist, *warum*
 * jemand oben steht.
 */
export interface SuggestionFacts {
  /** ISO date of the last time this person had this role, `null` if never. */
  lastAssignedAt: string | null;
  /** Days between that date and the target meeting, `null` if never assigned. */
  daysSinceLastAssignment: number | null;
  /** How often this person has had this role in the past, all-time. */
  timesAssigned: number;
  /** Jobs of *any* role between the target date and later — the current load. */
  upcomingCommitments: UpcomingCommitment[];
}

export interface RoleSuggestion {
  personId: string;
  name: string;
  photoUpdatedAt: Date | null;
  /** 1-based; equal facts still produce distinct ranks, ordered by name. */
  rank: number;
  facts: SuggestionFacts;
}

/**
 * Hosting is the one role where person and place are the same decision: "bei
 * Niko" *is* Niko hosting. The suggestion therefore carries the home it comes
 * from, and the ranking runs over homes first — see `suggestHosts`.
 */
export interface HostSuggestion extends RoleSuggestion {
  facts: SuggestionFacts & {
    /**
     * This person is away that evening. Listed behind their own flatmates
     * rather than dropped, so the UI can say why they are not an option — a
     * name simply missing reads as a bug.
     *
     * Not the same as `deferredReason === 'AWAY'`, which says the *whole*
     * household is gone. One of two flatmates on holiday leaves the home
     * available and only that person marked.
     */
    away: boolean;
    /** Set aside for this evening; still listed, just at the back. */
    deferred: boolean;
    deferredReason: DeferralReason | null;
    home: HomeSuggestionFacts;
  };
}

/** Composed rather than restated, so the two cannot drift apart. */
export type HomeSuggestionFacts = HomeFacts & {
  locationId: string;
  locationName: string;
  hostWeight: number;
};
