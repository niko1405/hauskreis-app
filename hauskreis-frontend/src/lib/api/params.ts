/**
 * Abfrageparameter der Listen-Routen. Liegen getrennt, weil sowohl die
 * Endpunkt-Funktionen als auch die Query-Keys sie brauchen.
 */
import type { MeetingType, TopicStatus } from './types';

/** `take` maximal 100, Vorgabe 20 (`docs/api-fuer-frontend.md` §5). */
export interface PageParams {
  take?: number;
  skip?: number;
}

export const PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface MeetingListParams extends PageParams {
  scope?: 'upcoming' | 'past' | 'all';
  search?: string;
  /** Kalendertag `YYYY-MM-DD`, kein Zeitstempel. */
  from?: string;
  to?: string;
}

export interface TopicListParams extends PageParams {
  status?: TopicStatus;
  search?: string;
  from?: string;
  to?: string;
}

export interface SongListParams extends PageParams {
  search?: string;
  sort?: 'title' | 'popular' | 'recent';
  /** String-Enum, kein Boolean — die API erwartet `"true"` bzw. `"false"`. */
  playedOnly?: 'true' | 'false';
}

export interface AbsenceListParams extends PageParams {
  personId?: string;
  scope?: 'upcoming' | 'all';
}

/**
 * `scope` grenzt ein, welche Runden gemeint sind. Die **laufende** zählt zu
 * `upcoming` — sie ist nicht vorbei.
 */
export interface PrayerBuddyListParams extends PageParams {
  scope?: 'past' | 'upcoming' | 'all';
}

/** `from` und `to` sind Pflicht; die Spanne ist serverseitig auf ein Jahr begrenzt. */
export interface AssignmentParams {
  from: string;
  to: string;
  personId?: string;
}

export type { MeetingType };
