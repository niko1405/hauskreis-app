/** `…/locations` — acht Einträge, nicht paginiert. Schreiben nur als Admin. */
import {
  apiDelete,
  apiGet,
  apiGetResource,
  apiPatch,
  apiPost,
  type Resource,
} from '../client';
import { hkPath } from './paths';
import type {
  CreateLocationInput,
  Location,
  UpdateLocationInput,
} from '../types';

const base = (hauskreisId: string) => hkPath(hauskreisId, '/locations');

export function listLocations(
  hauskreisId: string,
  signal?: AbortSignal,
): Promise<Location[]> {
  return apiGet<Location[]>(base(hauskreisId), { signal });
}

export function getLocation(
  hauskreisId: string,
  locationId: string,
  options: { previous?: Resource<Location>; signal?: AbortSignal } = {},
): Promise<Resource<Location>> {
  return apiGetResource<Location>(
    `${base(hauskreisId)}/${locationId}`,
    options,
  );
}

/** Nur Admin. `latitude` und `longitude` gehen nur gemeinsam, sonst `400`. */
export function createLocation(
  hauskreisId: string,
  input: CreateLocationInput,
): Promise<Location> {
  return apiPost<Location>(base(hauskreisId), input);
}

/** Nur Admin. */
export function updateLocation(
  hauskreisId: string,
  locationId: string,
  input: UpdateLocationInput,
  etag: string | undefined,
): Promise<Resource<Location>> {
  return apiPatch<Location>(`${base(hauskreisId)}/${locationId}`, input, {
    etag,
  });
}

/** Nur Admin. */
export function deleteLocation(
  hauskreisId: string,
  locationId: string,
): Promise<void> {
  return apiDelete(`${base(hauskreisId)}/${locationId}`);
}
