'use client';

import { useQuery } from '@tanstack/react-query';
import { STALE } from '../cache';
import { peopleApi } from '../endpoints';
import type {
  CreatePersonInput,
  InvitePersonInput,
  Person,
  PersonRole,
  UpdatePersonInput,
} from '../types';
import { useHk } from './use-hk';
import { useApiMutation, useResource, useResourceUpdate } from './use-resource';

/** Neun Einträge, nicht paginiert. */
export function usePeople() {
  const { hauskreisId, enabled, keys } = useHk();

  return useQuery({
    queryKey: keys.people.list,
    queryFn: ({ signal }) => peopleApi.listPeople(hauskreisId, signal),
    enabled,
    staleTime: STALE.reference,
  });
}

/** Nachschlagewerk `id → Person`, für Avatare und Namen in Listen. */
export function usePersonLookup() {
  const { data } = usePeople();
  return new Map((data ?? []).map((person) => [person.id, person]));
}

export function usePerson(personId: string | undefined) {
  const { hauskreisId, enabled, keys } = useHk();

  return useResource<Person>(
    keys.people.detail(personId ?? ''),
    ({ previous, signal }) =>
      peopleApi.getPerson(hauskreisId, personId!, { previous, signal }),
    { enabled: enabled && Boolean(personId), staleTime: STALE.detail },
  );
}

export function useUpdatePerson(personId: string) {
  const { hauskreisId, keys, derived } = useHk();

  return useResourceUpdate<Person, UpdatePersonInput>({
    queryKey: keys.people.detail(personId),
    update: (input, etag) =>
      peopleApi.updatePerson(hauskreisId, personId, input, etag),
    invalidateKeys: [keys.people.list, ...derived],
  });
}

/**
 * Nur Admin. Die Ehemaligen mit gelöschtem Konto.
 *
 * `enabled` von außen, weil die Liste nur im aufgeklappten Teil des
 * Einladen-Formulars gebraucht wird — und der ist meistens zu.
 */
export function useFormerMembers(enabled = true) {
  const { hauskreisId, enabled: ready, keys } = useHk();

  return useQuery({
    queryKey: keys.people.former,
    queryFn: ({ signal }) => peopleApi.listFormerMembers(hauskreisId, signal),
    enabled: ready && enabled,
    staleTime: STALE.reference,
  });
}

/** Nur Admin. */
export function useInvitePerson() {
  const { hauskreisId, keys } = useHk();

  return useApiMutation(
    (input: InvitePersonInput) => peopleApi.invitePerson(hauskreisId, input),
    { invalidateKeys: [keys.people.all] },
  );
}

/** Nur Admin. Ohne Keycloak-Konto — für Leute, die die App nicht nutzen. */
export function useCreatePerson() {
  const { hauskreisId, keys } = useHk();

  return useApiMutation(
    (input: CreatePersonInput) => peopleApi.createPerson(hauskreisId, input),
    { invalidateKeys: [keys.people.all] },
  );
}

/**
 * Nur Admin. Macht jemanden zum Admin oder nimmt die Rechte wieder.
 *
 * Liest den Stand **selbst**, statt ihn wie `useUpdatePerson` im Cache zu
 * erwarten: die Verwaltungsliste hält nur die Übersicht, und neun Detail-Stände
 * auf Vorrat zu laden wäre teurer als einer, wenn wirklich jemand etwas ändert.
 *
 * Der frische Stand liefert nebenbei die Felder, die das PATCH trotz seines
 * Namens verlangt (Zod-Defaults) — aus der Liste genommen wären sie einen
 * Wimpernschlag alt.
 */
export function useSetPersonRole() {
  const { hauskreisId, keys, derived } = useHk();

  return useApiMutation(
    async ({ personId, role }: { personId: string; role: PersonRole }) => {
      const current = await peopleApi.getPerson(hauskreisId, personId);

      return peopleApi.updatePerson(
        hauskreisId,
        personId,
        {
          role,
          playsInstrument: current.data.playsInstrument,
          canHost: current.data.canHost,
          autoAttend: current.data.autoAttend,
        },
        current.etag,
      );
    },
    { invalidateKeys: [keys.people.all, ...derived] },
  );
}

/** Nur Admin. Schickt die Einladungsmail noch einmal. */
export function useResendInvitation() {
  const { hauskreisId, keys } = useHk();

  return useApiMutation(
    (personId: string) => peopleApi.resendInvitation(hauskreisId, personId),
    { invalidateKeys: [keys.people.all] },
  );
}

/** Nur Admin. */
export function useDeletePerson() {
  const { hauskreisId, keys, derived } = useHk();

  return useApiMutation(
    (personId: string) => peopleApi.deletePerson(hauskreisId, personId),
    { invalidateKeys: [keys.people.all, ...derived] },
  );
}
