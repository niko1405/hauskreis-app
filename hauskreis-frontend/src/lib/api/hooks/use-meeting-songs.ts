'use client';

import { useQuery } from '@tanstack/react-query';
import { STALE } from '../cache';
import { meetingSongsApi } from '../endpoints';
import type { AddMeetingSongInput, MeetingSong } from '../types';
import { useHk } from './use-hk';
import { useApiMutation } from './use-resource';

export function useMeetingSongs(meetingId: string | undefined) {
  const { hauskreisId, enabled, keys } = useHk();

  return useQuery({
    queryKey: keys.meetings.songs(meetingId ?? ''),
    queryFn: ({ signal }) =>
      meetingSongsApi.listMeetingSongs(hauskreisId, meetingId!, signal),
    enabled: enabled && Boolean(meetingId),
    staleTime: STALE.detail,
  });
}

/**
 * Entweder ein Lied aus der Datenbank (`songId`) oder ein neues (`title`) —
 * so wächst die Song-Datenbank mit jedem Vorschlag mit.
 */
export function useAddMeetingSong(meetingId: string) {
  const { hauskreisId, keys } = useHk();

  return useApiMutation(
    (input: AddMeetingSongInput) =>
      meetingSongsApi.addMeetingSong(hauskreisId, meetingId, input),
    { invalidateKeys: [keys.meetings.songs(meetingId), keys.songs.all] },
  );
}

/**
 * Dieselbe Ordnung wie der Server (`bySetlistThenVotes`): die Setlist nach
 * Platz, dann die Vorschläge nach Stimmen und bei Gleichstand nach Alter. Die
 * optimistischen Fassungen sortieren hiermit nach, sonst spränge eine Zeile
 * erst mit der Antwort an ihren Platz.
 */
export function sortMeetingSongs(songs: readonly MeetingSong[]): MeetingSong[] {
  return songs.toSorted((a, b) => {
    if (a.isSelected !== b.isSelected) return a.isSelected ? -1 : 1;
    const age = a.createdAt.localeCompare(b.createdAt);
    if (a.isSelected) {
      return (a.position ?? Infinity) - (b.position ?? Infinity) || age;
    }
    return b.votes - a.votes || age;
  });
}

/**
 * Auch ein Schalter, also auch vorgreifend. In die Setlist heißt ans Ende,
 * heraus heißt zurück zu den Vorschlägen — die Stimmen bleiben dabei stehen.
 */
export function useSetMeetingSongSelected(meetingId: string) {
  const { hauskreisId, keys } = useHk();

  return useApiMutation(
    ({
      meetingSongId,
      isSelected,
    }: {
      meetingSongId: string;
      isSelected: boolean;
    }) =>
      meetingSongsApi.setMeetingSongSelected(
        hauskreisId,
        meetingId,
        meetingSongId,
        isSelected,
      ),
    {
      invalidateKeys: [keys.meetings.songs(meetingId), keys.songs.all],
      optimistic: (input, patch) =>
        patch<MeetingSong[]>(keys.meetings.songs(meetingId), (songs) => {
          const last = Math.max(
            0,
            ...songs.map((entry) => entry.position ?? 0),
          );
          return sortMeetingSongs(
            songs.map((entry) =>
              entry.id === input.meetingSongId
                ? {
                    ...entry,
                    isSelected: input.isSelected,
                    position: input.isSelected ? last + 1 : null,
                  }
                : entry,
            ),
          );
        }),
    },
  );
}

/**
 * Die Setlist in neuer Reihenfolge — vorgreifend, sonst spränge die gerade
 * losgelassene Zeile an ihren alten Platz zurück, bis die Antwort da ist.
 */
export function useReorderSetlist(meetingId: string) {
  const { hauskreisId, keys } = useHk();

  return useApiMutation(
    (meetingSongIds: string[]) =>
      meetingSongsApi.reorderSetlist(hauskreisId, meetingId, meetingSongIds),
    {
      invalidateKeys: [keys.meetings.songs(meetingId)],
      optimistic: (meetingSongIds, patch) =>
        patch<MeetingSong[]>(keys.meetings.songs(meetingId), (songs) =>
          sortMeetingSongs(
            songs.map((entry) => {
              const index = meetingSongIds.indexOf(entry.id);
              return index === -1 ? entry : { ...entry, position: index + 1 };
            }),
          ),
        ),
    },
  );
}

/** Eine Stimme setzen oder zurücknehmen, vorgreifend samt neuer Reihenfolge. */
export function useVoteMeetingSong(meetingId: string) {
  const { hauskreisId, keys } = useHk();

  return useApiMutation(
    ({ meetingSongId, voted }: { meetingSongId: string; voted: boolean }) =>
      meetingSongsApi.voteMeetingSong(
        hauskreisId,
        meetingId,
        meetingSongId,
        voted,
      ),
    {
      invalidateKeys: [keys.meetings.songs(meetingId)],
      optimistic: (input, patch) =>
        patch<MeetingSong[]>(keys.meetings.songs(meetingId), (songs) =>
          sortMeetingSongs(
            songs.map((entry) =>
              entry.id === input.meetingSongId &&
              entry.votedByMe !== input.voted
                ? {
                    ...entry,
                    votedByMe: input.voted,
                    votes: entry.votes + (input.voted ? 1 : -1),
                  }
                : entry,
            ),
          ),
        ),
    },
  );
}

export function useRemoveMeetingSong(meetingId: string) {
  const { hauskreisId, keys } = useHk();

  return useApiMutation(
    (meetingSongId: string) =>
      meetingSongsApi.removeMeetingSong(hauskreisId, meetingId, meetingSongId),
    { invalidateKeys: [keys.meetings.songs(meetingId), keys.songs.all] },
  );
}

export function useSongLeaders(meetingId: string | undefined) {
  const { hauskreisId, enabled, keys } = useHk();

  return useQuery({
    queryKey: keys.meetings.songLeaders(meetingId ?? ''),
    queryFn: ({ signal }) =>
      meetingSongsApi.getSongLeaders(hauskreisId, meetingId!, signal),
    enabled: enabled && Boolean(meetingId),
    staleTime: STALE.detail,
  });
}

/** Setzt die komplette Liste; ohne Vorbedingung. */
export function useSetSongLeaders(meetingId: string) {
  const { hauskreisId, keys, derived } = useHk();

  return useApiMutation(
    (personIds: string[]) =>
      meetingSongsApi.setSongLeaders(hauskreisId, meetingId, { personIds }),
    {
      invalidateKeys: [
        keys.meetings.songLeaders(meetingId),
        keys.meetings.all,
        ...derived,
      ],
    },
  );
}

/** Berücksichtigt, wer überhaupt ein Instrument spielt. */
export function useSongLeaderSuggestions(
  meetingId: string | undefined,
  active = true,
) {
  const { hauskreisId, enabled, keys } = useHk();

  return useQuery({
    queryKey: keys.meetings.songLeaderSuggestions(meetingId ?? ''),
    queryFn: ({ signal }) =>
      meetingSongsApi.getSongLeaderSuggestions(hauskreisId, meetingId!, signal),
    enabled: enabled && Boolean(meetingId) && active,
    staleTime: STALE.suggestions,
  });
}
