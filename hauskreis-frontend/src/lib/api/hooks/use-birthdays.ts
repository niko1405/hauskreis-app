'use client';

import { useQuery } from '@tanstack/react-query';
import { STALE } from '../cache';
import { birthdaysApi } from '../endpoints';
import { useHk } from './use-hk';
import { useApiMutation, useResource, useResourceUpdate } from './use-resource';
import type {
  BirthdayGiftConfig,
  CreateGiftIdeaInput,
  DecideGiftInput,
  UpdateBirthdayGiftConfigInput,
  UpdateGiftPairingsInput,
} from '../types';

/**
 * Der ganze Geburtstags-Bildschirm in einer Abfrage.
 *
 * Fünf Stücke — alle Mitglieder, die kommenden Geburtstage, die eigene nächste
 * Rolle, die vergangenen, die Einstellungen — kommen zusammen an, weil sie
 * zusammen auf einem Schirm stehen. Fünf Abfragen bauten die Seite in Etappen
 * auf; dieselbe Entscheidung wie beim Startbildschirm.
 */
export function useBirthdays() {
  const { hauskreisId, enabled, keys } = useHk();

  return useQuery({
    queryKey: keys.birthdays.overview,
    queryFn: ({ signal }) =>
      birthdaysApi.getBirthdayOverview(hauskreisId, signal),
    enabled,
    staleTime: STALE.list,
  });
}

export function useBirthday(occasionId: string | undefined) {
  const { hauskreisId, enabled, keys } = useHk();

  return useQuery({
    queryKey: keys.birthdays.detail(occasionId ?? ''),
    queryFn: ({ signal }) =>
      birthdaysApi.getBirthday(hauskreisId, occasionId!, signal),
    enabled: enabled && Boolean(occasionId),
    staleTime: STALE.detail,
  });
}

/**
 * Alles, was an einem Geburtstag geschrieben wird, macht **beides** ungültig:
 * die Detailseite und die Übersicht. Ein ausgewähltes Geschenk steht auf der
 * Karte in der Liste genauso wie auf der Seite selbst.
 */
function birthdayKeys(
  keys: ReturnType<typeof useHk>['keys'],
  occasionId: string,
) {
  return [keys.birthdays.detail(occasionId), keys.birthdays.overview];
}

export function useProposeGiftIdea(occasionId: string) {
  const { hauskreisId, keys } = useHk();

  return useApiMutation(
    (input: CreateGiftIdeaInput) =>
      birthdaysApi.proposeGiftIdea(hauskreisId, occasionId, input),
    { invalidateKeys: birthdayKeys(keys, occasionId) },
  );
}

export function useRemoveGiftIdea(occasionId: string) {
  const { hauskreisId, keys } = useHk();

  return useApiMutation(
    (ideaId: string) =>
      birthdaysApi.removeGiftIdea(hauskreisId, occasionId, ideaId),
    { invalidateKeys: birthdayKeys(keys, occasionId) },
  );
}

export function useVoteGiftIdea(occasionId: string) {
  const { hauskreisId, keys } = useHk();

  return useApiMutation(
    (input: { ideaId: string; approve: boolean }) =>
      birthdaysApi.voteGiftIdea(
        hauskreisId,
        occasionId,
        input.ideaId,
        input.approve,
      ),
    { invalidateKeys: birthdayKeys(keys, occasionId) },
  );
}

export function useDecideGift(occasionId: string) {
  const { hauskreisId, keys } = useHk();

  return useApiMutation(
    (input: DecideGiftInput) =>
      birthdaysApi.decideGift(hauskreisId, occasionId, input),
    {
      // Auch der Startbildschirm: dort steht die Rolle „du besorgst ein
      // Geschenk", und ob schon etwas ausgesucht ist, gehört dazu.
      invalidateKeys: [...birthdayKeys(keys, occasionId), keys.home],
    },
  );
}

export function useBirthdayConfig() {
  const { hauskreisId, enabled, keys } = useHk();

  return useResource<BirthdayGiftConfig>(
    keys.birthdays.config,
    ({ signal }) => birthdaysApi.getBirthdayConfig(hauskreisId, signal),
    { enabled, staleTime: STALE.detail },
  );
}

export function useUpdateBirthdayConfig() {
  const { hauskreisId, keys } = useHk();

  return useResourceUpdate<BirthdayGiftConfig, UpdateBirthdayGiftConfigInput>({
    queryKey: keys.birthdays.config,
    update: (input, etag) =>
      birthdaysApi.updateBirthdayConfig(hauskreisId, input, etag),
    // Eine geänderte Einstellung verteilt die Zuständigkeiten sofort neu —
    // deshalb ist danach der ganze Zweig alt, nicht nur die Konfiguration.
    invalidateKeys: [keys.birthdays.all, keys.home],
  });
}

export function useGiftPairings() {
  const { hauskreisId, enabled, keys } = useHk();

  return useQuery({
    queryKey: keys.birthdays.pairings,
    queryFn: ({ signal }) => birthdaysApi.getGiftPairings(hauskreisId, signal),
    enabled,
    staleTime: STALE.detail,
  });
}

export function useSetGiftPairings() {
  const { hauskreisId, keys } = useHk();

  return useApiMutation(
    (input: UpdateGiftPairingsInput) =>
      birthdaysApi.setGiftPairings(hauskreisId, input),
    { invalidateKeys: [keys.birthdays.all, keys.home] },
  );
}
