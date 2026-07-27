/**
 * The shared vocabulary of the suggestion engine.
 *
 * Host, Thema und Song folgen fachlich demselben Muster ("wer war am längsten
 * nicht dran"). Statt das dreimal zu bauen, normalisieren die Adapter ihre
 * Zuweisungen auf `RoleAssignmentEvent` — die Ranking-Logik kennt danach nur
 * noch Personen, Rollen und Daten, nicht mehr Termine, Themen oder Songs.
 */

/**
 * Extended in later phases (TOPIC, SONG). Adding a value means writing one
 * adapter, not touching the ranking.
 */
export const AssignmentRole = {
  HOST: 'HOST',
} as const;

export type AssignmentRole =
  (typeof AssignmentRole)[keyof typeof AssignmentRole];

/** One person did (or will do) one job on one date. */
export interface RoleAssignmentEvent {
  personId: string;
  role: AssignmentRole;
  /** The meeting date. UTC midnight, matching Prisma's `@db.Date`. */
  date: Date;
}

export interface EligiblePerson {
  id: string;
  name: string;
}

/** A job the person has already agreed to, still ahead of the target date. */
export interface UpcomingCommitment {
  role: AssignmentRole;
  /** ISO date (`YYYY-MM-DD`). */
  date: string;
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
  /** 1-based; equal facts still produce distinct ranks, ordered by name. */
  rank: number;
  facts: SuggestionFacts;
}
