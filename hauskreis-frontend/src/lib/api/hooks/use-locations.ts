'use client';

import { useQuery } from '@tanstack/react-query';
import { STALE } from '../cache';
import { locationsApi } from '../endpoints';
import type {
  CreateLocationInput,
  Location,
  UpdateLocationInput,
} from '../types';
import { useHk } from './use-hk';
import { useApiMutation, useResource, useResourceUpdate } from './use-resource';

/** Acht Einträge, nicht paginiert. */
export function useLocations() {
  const { hauskreisId, enabled, keys } = useHk();

  return useQuery({
    queryKey: keys.locations.list,
    queryFn: ({ signal }) => locationsApi.listLocations(hauskreisId, signal),
    enabled,
    staleTime: STALE.reference,
  });
}

export function useLocation(locationId: string | undefined) {
  const { hauskreisId, enabled, keys } = useHk();

  return useResource<Location>(
    keys.locations.detail(locationId ?? ''),
    ({ previous, signal }) =>
      locationsApi.getLocation(hauskreisId, locationId!, { previous, signal }),
    { enabled: enabled && Boolean(locationId), staleTime: STALE.detail },
  );
}

/**
 * Fragt nach, ob es diese Anschrift schon gibt.
 *
 * Bewusst eine Mutation und keine Query: das ist ein Nachschlagen auf Zuruf,
 * kein Zustand, der frisch gehalten werden müsste — und die Antwort darf auf
 * keinen Fall aus dem Cache kommen, während jemand seine Adresse tippt.
 */
export function useResolveAddress() {
  const { hauskreisId } = useHk();

  return useApiMutation((address: string) =>
    locationsApi.resolveAddress(hauskreisId, address),
  );
}

export function useCreateLocation() {
  const { hauskreisId, keys } = useHk();

  return useApiMutation(
    (input: CreateLocationInput) =>
      locationsApi.createLocation(hauskreisId, input),
    { invalidateKeys: [keys.locations.all] },
  );
}

export function useUpdateLocation(locationId: string) {
  const { hauskreisId, keys, derived } = useHk();

  return useResourceUpdate<Location, UpdateLocationInput>({
    queryKey: keys.locations.detail(locationId),
    update: (input, etag) =>
      locationsApi.updateLocation(hauskreisId, locationId, input, etag),
    invalidateKeys: [keys.locations.list, keys.meetings.all, ...derived],
  });
}

/** Legt den Ort still — er verschwindet aus der Auswahl, nicht aus dem Archiv. */
export function useDeleteLocation() {
  const { hauskreisId, keys, derived } = useHk();

  return useApiMutation(
    (locationId: string) =>
      locationsApi.deleteLocation(hauskreisId, locationId),
    { invalidateKeys: [keys.locations.all, keys.meetings.all, ...derived] },
  );
}
