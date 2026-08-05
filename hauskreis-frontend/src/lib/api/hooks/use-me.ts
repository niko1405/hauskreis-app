'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiReady } from '../../auth/auth-bridge';
import { isAdmin } from '../../auth/roles';
import { STALE } from '../cache';
import { coreApi } from '../endpoints';
import { isStatus } from '../errors';
import { qk } from '../query-keys';
import { useApiMutation } from './use-resource';
import { useHk } from './use-hk';
import type {
  CreateHauskreisInput,
  LeaveHauskreisInput,
  SetHomeInput,
} from '../types';

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

/**
 * Was nach einem Umzug nicht mehr stimmt.
 *
 * Eine Wohnung zu wechseln benennt womöglich zwei Orte um, ändert die eigene
 * Person und verschiebt die Host-Rangfolge — deshalb fällt hier großzügig
 * alles weg, was davon abhängt, statt einzelne Einträge zu pflegen.
 */
function useHomeInvalidation() {
  const { keys, derived } = useHk();
  return [
    qk.me,
    keys.locations.all,
    keys.people.all,
    keys.meetings.all,
    ...derived,
  ];
}

/** „Hier wohne ich." Legt die Wohnung an oder zieht in eine vorhandene ein. */
export function useSetHome() {
  const invalidateKeys = useHomeInvalidation();

  return useApiMutation((input: SetHomeInput) => coreApi.setHome(input), {
    invalidateKeys,
  });
}

/** „Ich bringe keine Wohnung mit." */
export function useClearHome() {
  const invalidateKeys = useHomeInvalidation();

  return useApiMutation(() => coreApi.clearHome(), { invalidateKeys });
}

/**
 * Die eigene E-Mail ändern.
 *
 * Danach steht in Keycloak eine unbestätigte Adresse — und damit steht man
 * **vor** der App, nicht mehr darin: `AuthGuard` weist jedes Token mit
 * unbestätigter Adresse ab. Der Weg zurück führt über die Mail; findet man sie
 * nicht, hilft `useResendVerification`.
 */
export function useChangeEmail() {
  const { keys } = useHk();

  return useApiMutation((email: string) => coreApi.changeEmail(email), {
    invalidateKeys: [qk.me, keys.people.all],
  });
}

/**
 * Die Bestätigungsmail noch einmal anfordern.
 *
 * Ohne `invalidateKeys`: Der Aufruf ändert nichts, was im Cache liegt, und
 * ausgerechnet hier wäre ein Neuladen sinnlos — wer diesen Knopf sieht,
 * bekommt auf alles andere gerade `403`.
 */
export function useResendVerification() {
  return useApiMutation(() => coreApi.resendVerification());
}

// ── Der Hauskreis, in dem man steckt ────────────────────────────────────────

/**
 * Offene Einladungen in andere Hauskreise.
 *
 * Auch dann beantwortbar, wenn es noch gar keine Person gibt — beim allerersten
 * Öffnen ist das der einzige Weg hinein. Deshalb hängt die Abfrage am Token und
 * nicht an `me`.
 */
export function useInvitations() {
  const ready = useApiReady();

  return useQuery({
    queryKey: qk.invitations,
    queryFn: ({ signal }) => coreApi.listInvitations(signal),
    enabled: ready,
    staleTime: STALE.reference,
  });
}

/** Gründen: man wird dort Admin. Geht nur, wenn man nirgends mehr dabei ist. */
export function useCreateHauskreis() {
  return useApiMutation(
    (input: CreateHauskreisInput) => coreApi.createHauskreis(input),
    { invalidateKeys: [qk.me, qk.hauskreise, qk.invitations] },
  );
}

/**
 * Verlassen. Danach ist der ganze Cache wertlos — er gehört zu einem
 * Hauskreis, in dem man nicht mehr ist.
 */
export function useLeaveHauskreis(hauskreisId: string) {
  const queryClient = useQueryClient();

  return useApiMutation(
    (input: LeaveHauskreisInput) => coreApi.leaveHauskreis(hauskreisId, input),
    { onSuccess: () => queryClient.clear() },
  );
}

/** Annehmen heißt: den bisherigen Hauskreis im selben Zug verlassen. */
export function useAcceptInvitation() {
  const queryClient = useQueryClient();

  return useApiMutation(
    ({ personId, ...input }: LeaveHauskreisInput & { personId: string }) =>
      coreApi.acceptInvitation(personId, input),
    { onSuccess: () => queryClient.clear() },
  );
}
