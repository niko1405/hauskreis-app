'use client';

import { useQuery } from '@tanstack/react-query';
import { songLookupApi } from '../endpoints';
import type { LyricsLinkCandidate, SongMetadata } from '../types';
import { useHk } from './use-hk';
import { useApiMutation } from './use-resource';

const HOUR = 60 * 60 * 1000;

/**
 * Ob die Hilfe beim Anlegen überhaupt eingerichtet ist.
 *
 * Dasselbe Muster wie `usePushPublicKey`: einmal fragen, und die Knöpfe gar
 * nicht erst zeigen, statt sie anzubieten und an einem fehlenden Schlüssel
 * scheitern zu lassen. Die Antwort ändert sich nur beim Serverstart.
 */
export function useSongLookupStatus() {
  const { hauskreisId, enabled, keys } = useHk();

  return useQuery({
    queryKey: keys.songs.lookupStatus,
    queryFn: ({ signal }) =>
      songLookupApi.getSongLookupStatus(hauskreisId, signal),
    enabled,
    staleTime: HOUR,
  });
}

/**
 * Mutation statt Query, und das ist der eigentliche Punkt: Der Aufruf hängt am
 * Knopfdruck, nicht am Tippen. Als Query liefe er bei jedem Buchstaben neu,
 * und jeder Lauf kostet Geld.
 */
export function useSongMetadataFromLink() {
  const { hauskreisId } = useHk();

  return useApiMutation<SongMetadata, string>((url) =>
    songLookupApi.songMetadataFromLink(hauskreisId, url),
  );
}

export function useLyricsLinkSuggestions() {
  const { hauskreisId } = useHk();

  return useApiMutation<
    { candidates: LyricsLinkCandidate[] },
    { title: string; artist?: string | null; more?: boolean }
  >((input) => songLookupApi.lyricsLinkSuggestions(hauskreisId, input));
}
