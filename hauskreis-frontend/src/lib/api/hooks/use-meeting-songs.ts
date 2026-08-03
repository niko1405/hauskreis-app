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

/** Auch ein Schalter, also auch vorgreifend. */
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
        patch<MeetingSong[]>(keys.meetings.songs(meetingId), (songs) =>
          songs.map((entry) =>
            entry.id === input.meetingSongId
              ? { ...entry, isSelected: input.isSelected }
              : entry,
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
