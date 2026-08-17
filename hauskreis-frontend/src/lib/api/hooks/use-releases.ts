'use client';

import { useQuery } from '@tanstack/react-query';
import { releasesApi } from '../endpoints';
import { qk } from '../query-keys';

/**
 * Was es Neues gibt.
 *
 * Ohne `useHk`: Die Liste hängt an keinem Hauskreis, sondern an der Fassung
 * der App. Sie ändert sich nur mit einem Deploy — also einmal holen und liegen
 * lassen, bis die Seite neu geladen wird.
 */
export function useReleases() {
  return useQuery({
    queryKey: qk.releases,
    queryFn: ({ signal }) => releasesApi.listReleases(signal),
    staleTime: Infinity,
  });
}
