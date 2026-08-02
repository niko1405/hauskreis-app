'use client';

import { useQuery } from '@tanstack/react-query';
import { STALE } from '../cache';
import { dashboardApi } from '../endpoints';
import type { AssignmentParams } from '../params';
import { useHk } from './use-hk';

/** Der ganze Startbildschirm in einem Aufruf. */
export function useHome() {
  const { hauskreisId, enabled, keys } = useHk();

  return useQuery({
    queryKey: keys.home,
    queryFn: ({ signal }) => dashboardApi.getHome(hauskreisId, signal),
    enabled,
    staleTime: STALE.home,
    refetchOnWindowFocus: true,
  });
}

/**
 * Ohne `personId` die Mehrwochen-Tabelle, mit `personId` die Badges einer
 * Person. Nicht paginiert — die Spanne ist serverseitig auf ein Jahr begrenzt.
 */
export function useAssignments(params: AssignmentParams, enabled = true) {
  const hk = useHk();

  return useQuery({
    queryKey: hk.keys.assignments(params),
    queryFn: ({ signal }) =>
      dashboardApi.getAssignments(hk.hauskreisId, params, signal),
    enabled: hk.enabled && enabled,
    staleTime: STALE.list,
  });
}

export function useArchiveSummary() {
  const { hauskreisId, enabled, keys } = useHk();

  return useQuery({
    queryKey: keys.archive,
    queryFn: ({ signal }) =>
      dashboardApi.getArchiveSummary(hauskreisId, signal),
    enabled,
    staleTime: STALE.archive,
  });
}
