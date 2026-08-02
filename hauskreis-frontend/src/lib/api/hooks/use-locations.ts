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

/** Nur Admin. */
export function useCreateLocation() {
  const { hauskreisId, keys } = useHk();

  return useApiMutation(
    (input: CreateLocationInput) =>
      locationsApi.createLocation(hauskreisId, input),
    { invalidateKeys: [keys.locations.all] },
  );
}

/** Nur Admin. */
export function useUpdateLocation(locationId: string) {
  const { hauskreisId, keys, derived } = useHk();

  return useResourceUpdate<Location, UpdateLocationInput>({
    queryKey: keys.locations.detail(locationId),
    update: (input, etag) =>
      locationsApi.updateLocation(hauskreisId, locationId, input, etag),
    invalidateKeys: [keys.locations.list, keys.meetings.all, ...derived],
  });
}

/** Nur Admin. */
export function useDeleteLocation() {
  const { hauskreisId, keys, derived } = useHk();

  return useApiMutation(
    (locationId: string) =>
      locationsApi.deleteLocation(hauskreisId, locationId),
    { invalidateKeys: [keys.locations.all, keys.meetings.all, ...derived] },
  );
}
