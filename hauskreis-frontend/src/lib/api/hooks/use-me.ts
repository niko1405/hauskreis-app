'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiReady } from '../../auth/auth-bridge';
import { isAdmin } from '../../auth/roles';
import { STALE } from '../cache';
import { coreApi } from '../endpoints';
import { isStatus } from '../errors';
import { qk } from '../query-keys';

/**
 * Wer bin ich, und was darf ich.
 *
 * Wartet, bis wirklich ein Token vorliegt — angemeldet zu sein reicht nicht,
 * die Sitzung wird asynchron wiederhergestellt. Ohne das ginge die Abfrage
 * beim ersten Rendern ohne Header raus, käme mit `401` zurück und bliebe wegen
 * `retry: false` für immer im Fehlerzustand.
 *
 * `404` ist hier kein Fehler im üblichen Sinn, sondern ein eigener Zustand:
 * die E-Mail-Adresse aus dem Token gehört zu keiner Person. Dann hilft nur
 * eine Einladung durch einen Admin — deshalb kein Retry.
 */
export function useMe() {
  const ready = useApiReady();

  const query = useQuery({
    queryKey: qk.me,
    queryFn: ({ signal }) => coreApi.getMe(signal),
    enabled: ready,
    staleTime: STALE.reference,
    retry: false,
  });

  return {
    ...query,
    me: query.data,
    isAdmin: isAdmin(query.data),
    notInvited: isStatus(query.error, 404),
    /** Solange kein Token da ist, ist „noch nichts geladen" kein Fehler. */
    isLoading: !ready || query.isLoading,
  };
}
