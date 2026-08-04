/**
 * Query-Keys als Baum, damit Invalidierung per Präfix funktioniert:
 * `invalidateQueries({ queryKey: qk.hk(id).meetings.all })` trifft Liste,
 * Detail und Vorschläge auf einen Schlag.
 */
import type {
  AbsenceListParams,
  AssignmentParams,
  MeetingListParams,
  PrayerBuddyListParams,
  SongListParams,
  TopicListParams,
} from './params';

export const qk = {
  me: ['me'] as const,
  health: ['health'] as const,
  hauskreise: ['hauskreise'] as const,
  invitations: ['invitations'] as const,

  push: {
    all: ['push'] as const,
    publicKey: ['push', 'public-key'] as const,
    settings: ['push', 'settings'] as const,
    subscriptions: ['push', 'subscriptions'] as const,
  },

  hk: (hauskreisId: string) => {
    const root = ['hk', hauskreisId] as const;
    return {
      all: root,

      home: [...root, 'home'] as const,
      archive: [...root, 'archive'] as const,
      assignments: (params: AssignmentParams) =>
        [...root, 'assignments', params] as const,

      people: {
        all: [...root, 'people'] as const,
        list: [...root, 'people', 'list'] as const,
        detail: (personId: string) =>
          [...root, 'people', 'detail', personId] as const,
      },

      locations: {
        all: [...root, 'locations'] as const,
        list: [...root, 'locations', 'list'] as const,
        detail: (locationId: string) =>
          [...root, 'locations', 'detail', locationId] as const,
      },

      meetings: {
        all: [...root, 'meetings'] as const,
        list: (params: MeetingListParams) =>
          [...root, 'meetings', 'list', params] as const,
        detail: (meetingId: string) =>
          [...root, 'meetings', 'detail', meetingId] as const,
        hostSuggestions: (meetingId: string) =>
          [...root, 'meetings', meetingId, 'host-suggestions'] as const,
        topicSuggestions: (meetingId: string) =>
          [...root, 'meetings', meetingId, 'topic-suggestions'] as const,
        songLeaderSuggestions: (meetingId: string) =>
          [...root, 'meetings', meetingId, 'song-leader-suggestions'] as const,
        songs: (meetingId: string) =>
          [...root, 'meetings', meetingId, 'songs'] as const,
        songLeaders: (meetingId: string) =>
          [...root, 'meetings', meetingId, 'song-leaders'] as const,
      },

      topics: {
        all: [...root, 'topics'] as const,
        list: (params: TopicListParams) =>
          [...root, 'topics', 'list', params] as const,
        detail: (topicId: string) =>
          [...root, 'topics', 'detail', topicId] as const,
      },

      songs: {
        all: [...root, 'songs'] as const,
        list: (params: SongListParams) =>
          [...root, 'songs', 'list', params] as const,
        detail: (songId: string) =>
          [...root, 'songs', 'detail', songId] as const,
      },

      absences: {
        all: [...root, 'absences'] as const,
        list: (params: AbsenceListParams) =>
          [...root, 'absences', 'list', params] as const,
        detail: (absenceId: string) =>
          [...root, 'absences', 'detail', absenceId] as const,
      },

      prayerBuddies: {
        all: [...root, 'prayer-buddies'] as const,
        list: (params: PrayerBuddyListParams) =>
          [...root, 'prayer-buddies', 'list', params] as const,
        current: [...root, 'prayer-buddies', 'current'] as const,
        config: [...root, 'prayer-buddies', 'config'] as const,
      },
    };
  },
};

/**
 * Nach jeder Änderung an einem Termin, Thema oder einer Zuteilung ändern sich
 * auch Home-Screen, Mehrwochen-Tabelle und Archiv. Statt das an zwanzig
 * Stellen einzeln aufzuzählen, gibt es hier eine Liste.
 */
export function derivedViewKeys(hauskreisId: string): readonly unknown[][] {
  const hk = qk.hk(hauskreisId);
  return [[...hk.home], [...hk.archive], [...hk.all, 'assignments']];
}
