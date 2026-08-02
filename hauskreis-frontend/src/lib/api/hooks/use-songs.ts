'use client';

import { useQuery } from '@tanstack/react-query';
import { STALE } from '../cache';
import { songsApi } from '../endpoints';
import type { SongListParams } from '../params';
import type { CreateSongInput, Song, UpdateSongInput } from '../types';
import { useHk } from './use-hk';
import { useInfiniteList } from './use-paginated';
import { useApiMutation, useResource, useResourceUpdate } from './use-resource';

/** Die Song-Datenbank. `sort`: `title` | `popular` | `recent`. */
export function useSongList(params: SongListParams = {}) {
  const { hauskreisId, enabled, keys } = useHk();

  return useInfiniteList({
    queryKey: keys.songs.list(params),
    fetchPage: ({ skip, take, signal }) =>
      songsApi.listSongs(hauskreisId, { ...params, skip, take }, signal),
    enabled,
    staleTime: STALE.archive,
  });
}

/**
 * Suche beim Eintragen eines Liedes. Serverseitig gefiltert — die Datenbank
 * wächst mit der Zeit, clientseitiges Filtern würde irgendwann alles laden.
 */
export function useSongSearch(search: string, active = true) {
  const { hauskreisId, enabled, keys } = useHk();
  const trimmed = search.trim();
  const params: SongListParams = { search: trimmed, take: 8, sort: 'popular' };

  return useQuery({
    queryKey: keys.songs.list(params),
    queryFn: ({ signal }) => songsApi.listSongs(hauskreisId, params, signal),
    enabled: enabled && active && trimmed.length >= 2,
    staleTime: STALE.archive,
  });
}

export function useSong(songId: string | undefined) {
  const { hauskreisId, enabled, keys } = useHk();

  return useResource<Song>(
    keys.songs.detail(songId ?? ''),
    ({ previous, signal }) =>
      songsApi.getSong(hauskreisId, songId!, { previous, signal }),
    { enabled: enabled && Boolean(songId), staleTime: STALE.detail },
  );
}

export function useCreateSong() {
  const { hauskreisId, keys } = useHk();

  return useApiMutation(
    (input: CreateSongInput) => songsApi.createSong(hauskreisId, input),
    { invalidateKeys: [keys.songs.all] },
  );
}

export function useUpdateSong(songId: string) {
  const { hauskreisId, keys } = useHk();

  return useResourceUpdate<Song, UpdateSongInput>({
    queryKey: keys.songs.detail(songId),
    update: (input, etag) =>
      songsApi.updateSong(hauskreisId, songId, input, etag),
    invalidateKeys: [keys.songs.all],
  });
}

/** Nur Admin. */
export function useDeleteSong() {
  const { hauskreisId, keys } = useHk();

  return useApiMutation(
    (songId: string) => songsApi.deleteSong(hauskreisId, songId),
    { invalidateKeys: [keys.songs.all, keys.meetings.all] },
  );
}

/** Nur Admin. */
export function useRunSongReminders() {
  const { hauskreisId } = useHk();
  return useApiMutation(() => songsApi.runSongReminders(hauskreisId));
}
