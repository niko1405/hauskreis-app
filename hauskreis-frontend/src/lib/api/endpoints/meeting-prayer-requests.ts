/**
 * Gebetsanliegen eines Termins — eines je Person.
 *
 * **`mine` statt einer Personen-Id**, und das ist Absicht bis in die URL:
 * Der Server nimmt die Person aus dem Token, es gibt also gar nichts, was das
 * Frontend hier verwechseln oder falsch mitschicken könnte. Schreiben an einer
 * fremden Zeile ist keine Regel, die geprüft wird — es ist keine Adresse, die
 * existiert.
 */
import { apiDelete, apiGet, apiPut, UNCONDITIONAL } from '../client';
import { hkPath } from './paths';
import type { PrayerRequest } from '../types';

const base = (hauskreisId: string, meetingId: string) =>
  hkPath(hauskreisId, `/meetings/${meetingId}/prayer-requests`);

export function listPrayerRequests(
  hauskreisId: string,
  meetingId: string,
  signal?: AbortSignal,
): Promise<PrayerRequest[]> {
  return apiGet<PrayerRequest[]>(base(hauskreisId, meetingId), { signal });
}

/** Legt das eigene an oder schreibt es um — der Server unterscheidet das nicht. */
export function saveMyPrayerRequest(
  hauskreisId: string,
  meetingId: string,
  text: string,
): Promise<PrayerRequest> {
  return apiPut<PrayerRequest>(
    `${base(hauskreisId, meetingId)}/mine`,
    { text },
    UNCONDITIONAL,
  ).then((r) => r.data);
}

export function removeMyPrayerRequest(
  hauskreisId: string,
  meetingId: string,
): Promise<void> {
  return apiDelete(`${base(hauskreisId, meetingId)}/mine`);
}
