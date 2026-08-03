/**
 * `…/locations` — eine Handvoll Einträge, nicht paginiert.
 *
 * Schreiben darf jede:r: ein Treffpunkt entsteht im Vorbeigehen. Geschützt ist
 * nur das Zuhause eines Menschen, und zwar vom Server (`409`, solange dort
 * jemand wohnt).
 */
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
  ResolvedAddress,
  UpdateLocationInput,
} from '../types';

const base = (hauskreisId: string) => hkPath(hauskreisId, '/locations');

/**
 * Gibt es diese Anschrift schon?
 *
 * Antwortet mit der Wohnung samt Bewohner:innen — daran hängt die Rückfrage
 * „Chris wohnt dort schon. Wohnt ihr zusammen?", bevor jemand einzieht.
 */
export function resolveAddress(
  hauskreisId: string,
  address: string,
): Promise<ResolvedAddress> {
  return apiPost<ResolvedAddress>(`${base(hauskreisId)}/resolve-address`, {
    address,
  });
}

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

/** `latitude` und `longitude` gehen nur gemeinsam, sonst `400`. */
export function createLocation(
  hauskreisId: string,
  input: CreateLocationInput,
): Promise<Location> {
  return apiPost<Location>(base(hauskreisId), input);
}

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

/** Legt den Ort still; er bleibt an vergangenen Terminen sichtbar. */
export function deleteLocation(
  hauskreisId: string,
  locationId: string,
): Promise<void> {
  return apiDelete(`${base(hauskreisId)}/${locationId}`);
}
