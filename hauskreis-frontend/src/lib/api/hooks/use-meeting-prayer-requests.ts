'use client';

import { useQuery } from '@tanstack/react-query';
import { STALE } from '../cache';
import { meetingPrayerRequestsApi } from '../endpoints';
import { useHk } from './use-hk';
import { useApiMutation } from './use-resource';

export function useMeetingPrayerRequests(meetingId: string | undefined) {
  const { hauskreisId, enabled, keys } = useHk();

  return useQuery({
    queryKey: keys.meetings.prayerRequests(meetingId ?? ''),
    queryFn: ({ signal }) =>
      meetingPrayerRequestsApi.listPrayerRequests(
        hauskreisId,
        meetingId!,
        signal,
      ),
    enabled: enabled && Boolean(meetingId),
    staleTime: STALE.detail,
  });
}

/**
 * Legt das eigene an oder schreibt es um.
 *
 * Ein Hook für beides, weil der Server es nicht unterscheidet: Es gibt genau
 * eines je Person und Abend, und ob dort schon etwas stand, ist für den
 * Aufrufer keine interessante Frage.
 */
export function useSaveMyPrayerRequest(meetingId: string) {
  const { hauskreisId, keys } = useHk();

  return useApiMutation(
    (text: string) =>
      meetingPrayerRequestsApi.saveMyPrayerRequest(
        hauskreisId,
        meetingId,
        text,
      ),
    { invalidateKeys: [keys.meetings.prayerRequests(meetingId)] },
  );
}

/**
 * `<void, void>` ausdrücklich: Ohne die Angabe rät TypeScript für die Eingabe
 * `unknown`, und `remove.mutate()` wäre ein Aufruf mit zu wenigen Argumenten.
 * Es gibt hier nichts mitzuschicken — welche Zeile gemeint ist, sagt die Route.
 */
export function useRemoveMyPrayerRequest(meetingId: string) {
  const { hauskreisId, keys } = useHk();

  return useApiMutation<void, void>(
    () =>
      meetingPrayerRequestsApi.removeMyPrayerRequest(hauskreisId, meetingId),
    { invalidateKeys: [keys.meetings.prayerRequests(meetingId)] },
  );
}
