'use client';

import { STALE } from '../cache';
import { absencesApi } from '../endpoints';
import type { AbsenceListParams } from '../params';
import type { Absence, CreateAbsenceInput, UpdateAbsenceInput } from '../types';
import { useHk } from './use-hk';
import { useInfiniteList } from './use-paginated';
import { useApiMutation, useResource, useResourceUpdate } from './use-resource';

export function useAbsenceList(params: AbsenceListParams = {}) {
  const { hauskreisId, enabled, keys } = useHk();

  return useInfiniteList({
    queryKey: keys.absences.list(params),
    fetchPage: ({ skip, take, signal }) =>
      absencesApi.listAbsences(hauskreisId, { ...params, skip, take }, signal),
    enabled,
    staleTime: STALE.list,
  });
}

export function useAbsence(absenceId: string | undefined) {
  const { hauskreisId, enabled, keys } = useHk();

  return useResource<Absence>(
    keys.absences.detail(absenceId ?? ''),
    ({ previous, signal }) =>
      absencesApi.getAbsence(hauskreisId, absenceId!, { previous, signal }),
    { enabled: enabled && Boolean(absenceId), staleTime: STALE.detail },
  );
}

/**
 * Ohne `personId` gilt der Eintrag für einen selbst. Der Server sagt daraufhin
 * betroffene Termine automatisch ab — deshalb ziehen auch Home und Termine nach.
 */
export function useCreateAbsence() {
  const { hauskreisId, keys, derived } = useHk();

  return useApiMutation(
    (input: CreateAbsenceInput) =>
      absencesApi.createAbsence(hauskreisId, input),
    { invalidateKeys: [keys.absences.all, keys.meetings.all, ...derived] },
  );
}

export function useUpdateAbsence(absenceId: string) {
  const { hauskreisId, keys, derived } = useHk();

  return useResourceUpdate<Absence, UpdateAbsenceInput>({
    queryKey: keys.absences.detail(absenceId),
    update: (input, etag) =>
      absencesApi.updateAbsence(hauskreisId, absenceId, input, etag),
    invalidateKeys: [keys.absences.all, keys.meetings.all, ...derived],
  });
}

export function useDeleteAbsence() {
  const { hauskreisId, keys, derived } = useHk();

  return useApiMutation(
    (absenceId: string) => absencesApi.deleteAbsence(hauskreisId, absenceId),
    { invalidateKeys: [keys.absences.all, keys.meetings.all, ...derived] },
  );
}

/** Nur Admin. */
export function useSyncAbsences() {
  const { hauskreisId, keys, derived } = useHk();

  return useApiMutation(() => absencesApi.syncAbsences(hauskreisId), {
    invalidateKeys: [keys.meetings.all, ...derived],
  });
}
