/** `…/prayer-buddies` — die Rotation in 2er-/3er-Gruppen. */
import {
  apiGet,
  apiGetResource,
  apiPost,
  apiPut,
  type Resource,
} from '../client';
import { hkPath } from './paths';
import type { PrayerBuddyListParams } from '../params';
import type {
  Page,
  PrayerBuddyConfig,
  PrayerBuddyRound,
  RotationResult,
  UpdateCycleConfigInput,
} from '../types';

const base = (hauskreisId: string) => hkPath(hauskreisId, '/prayer-buddies');

/** Vergangene und kommende Runden, absteigend. */
export function listPrayerBuddyRounds(
  hauskreisId: string,
  params: PrayerBuddyListParams = {},
  signal?: AbortSignal,
): Promise<Page<PrayerBuddyRound>> {
  return apiGet<Page<PrayerBuddyRound>>(base(hauskreisId), {
    query: { ...params },
    signal,
  });
}

export function getCurrentPrayerBuddies(
  hauskreisId: string,
  signal?: AbortSignal,
): Promise<PrayerBuddyRound> {
  return apiGet<PrayerBuddyRound>(`${base(hauskreisId)}/current`, { signal });
}

export function getPrayerBuddyConfig(
  hauskreisId: string,
  options: {
    previous?: Resource<PrayerBuddyConfig>;
    signal?: AbortSignal;
  } = {},
): Promise<Resource<PrayerBuddyConfig>> {
  return apiGetResource<PrayerBuddyConfig>(
    `${base(hauskreisId)}/config`,
    options,
  );
}

/** Nur Admin. Verlangt `If-Match`. */
export function updatePrayerBuddyConfig(
  hauskreisId: string,
  input: UpdateCycleConfigInput,
  etag: string | undefined,
): Promise<Resource<PrayerBuddyConfig>> {
  return apiPut<PrayerBuddyConfig>(`${base(hauskreisId)}/config`, input, {
    etag,
  });
}

/** Nur Admin. Würfelt die nächste Runde aus und benachrichtigt auf Wunsch. */
export function rotatePrayerBuddies(
  hauskreisId: string,
  notify = true,
): Promise<RotationResult> {
  return apiPost<RotationResult>(`${base(hauskreisId)}/rotate`, { notify });
}
