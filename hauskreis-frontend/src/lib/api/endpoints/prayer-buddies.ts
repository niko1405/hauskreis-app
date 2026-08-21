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
  PlanningResult,
  PrayerBuddyConfig,
  PrayerBuddyRound,
  RepairResult,
  RotationResult,
  UpdateCycleConfigInput,
} from '../types';

const base = (hauskreisId: string) => hkPath(hauskreisId, '/prayer-buddies');

/**
 * Runden, seitenweise. `scope` entscheidet auch über die Reihenfolge:
 * `upcoming` vorwärts (die nächste zuerst), sonst rückwärts wie ein Archiv.
 */
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

/**
 * Die laufende Runde — oder `null`, wenn für heute niemand zugeteilt ist.
 *
 * `null` ist hier der Normalfall und kein Rand: ein frisch gegründeter
 * Hauskreis hat noch keine Runde, und eine Gruppe aus einer Person bekommt
 * auch keine (`buildGroups` gibt für weniger als zwei Menschen nichts zurück).
 */
export function getCurrentPrayerBuddies(
  hauskreisId: string,
  signal?: AbortSignal,
): Promise<PrayerBuddyRound | null> {
  return apiGet<PrayerBuddyRound | null>(`${base(hauskreisId)}/current`, {
    signal,
  });
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

/**
 * Nur Admin. Beendet die laufende Runde und zieht die nächste geplante auf
 * heute vor; benachrichtigt auf Wunsch.
 */
export function rotatePrayerBuddies(
  hauskreisId: string,
  notify = true,
): Promise<RotationResult> {
  return apiPost<RotationResult>(`${base(hauskreisId)}/rotate`, { notify });
}

/** Nur Admin. Füllt den Vorlauf wieder auf fünf Runden auf, ohne zu melden. */
export function planPrayerBuddyRounds(
  hauskreisId: string,
): Promise<PlanningResult> {
  return apiPost<PlanningResult>(`${base(hauskreisId)}/plan`, {});
}

/**
 * Nur Admin. Zieht die **laufende** Runde auf die aktuelle Besetzung nach:
 * niemand steht draußen, niemand bleibt allein, keine Gruppe ist größer als
 * drei.
 *
 * Kein Neuwürfeln — wer schon miteinander betet, betet weiter miteinander.
 */
export function repairPrayerBuddyRound(
  hauskreisId: string,
): Promise<RepairResult> {
  return apiPost<RepairResult>(`${base(hauskreisId)}/repair`, {});
}
