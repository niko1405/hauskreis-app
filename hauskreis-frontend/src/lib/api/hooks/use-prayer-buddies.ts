'use client';

import { useQuery } from '@tanstack/react-query';
import { STALE } from '../cache';
import { prayerBuddiesApi } from '../endpoints';
import type { PrayerBuddyListParams } from '../params';
import type { PrayerBuddyConfig, UpdateCycleConfigInput } from '../types';
import { useHk } from './use-hk';
import { useInfiniteList } from './use-paginated';
import { useApiMutation, useResource, useResourceUpdate } from './use-resource';

/** Die laufende Runde: Zeitraum und alle Gruppen. */
export function useCurrentPrayerBuddies() {
  const { hauskreisId, enabled, keys } = useHk();

  return useQuery({
    queryKey: keys.prayerBuddies.current,
    queryFn: ({ signal }) =>
      prayerBuddiesApi.getCurrentPrayerBuddies(hauskreisId, signal),
    enabled,
    staleTime: STALE.list,
  });
}

/** Vergangene und kommende Runden. */
export function usePrayerBuddyRounds(params: PrayerBuddyListParams = {}) {
  const { hauskreisId, enabled, keys } = useHk();

  return useInfiniteList({
    queryKey: keys.prayerBuddies.list(params),
    fetchPage: ({ skip, take, signal }) =>
      prayerBuddiesApi.listPrayerBuddyRounds(
        hauskreisId,
        { ...params, skip, take },
        signal,
      ),
    enabled,
    staleTime: STALE.list,
  });
}

export function usePrayerBuddyConfig() {
  const { hauskreisId, enabled, keys } = useHk();

  return useResource<PrayerBuddyConfig>(
    keys.prayerBuddies.config,
    ({ previous, signal }) =>
      prayerBuddiesApi.getPrayerBuddyConfig(hauskreisId, { previous, signal }),
    { enabled, staleTime: STALE.detail },
  );
}

/** Nur Admin. Verlangt `If-Match`. */
export function useUpdatePrayerBuddyConfig() {
  const { hauskreisId, keys } = useHk();

  return useResourceUpdate<PrayerBuddyConfig, UpdateCycleConfigInput>({
    queryKey: keys.prayerBuddies.config,
    update: (input, etag) =>
      prayerBuddiesApi.updatePrayerBuddyConfig(hauskreisId, input, etag),
    invalidateKeys: [keys.prayerBuddies.all],
  });
}

/** Nur Admin. Neun Personen ergeben Gruppen zu zwei und drei. */
export function useRotatePrayerBuddies() {
  const { hauskreisId, keys, derived } = useHk();

  return useApiMutation(
    (notify: boolean = true) =>
      prayerBuddiesApi.rotatePrayerBuddies(hauskreisId, notify),
    { invalidateKeys: [keys.prayerBuddies.all, ...derived] },
  );
}
