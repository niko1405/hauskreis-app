'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE } from '../cache';
import { inviteLinksApi } from '../endpoints';
import { isStatus } from '../errors';
import { qk } from '../query-keys';
import { useApiMutation } from './use-resource';
import { useHk } from './use-hk';
import type { InviteLinkValidDays, JoinViaLinkInput } from '../types';

/** Nur Admin. Der aktuelle Link, auch ein abgelaufener — oder keiner. */
export function useInviteLink(options: { enabled?: boolean } = {}) {
  const { hauskreisId, enabled, keys } = useHk();

  return useQuery({
    queryKey: keys.inviteLink,
    queryFn: ({ signal }) => inviteLinksApi.getInviteLink(hauskreisId, signal),
    enabled: enabled && (options.enabled ?? true),
    staleTime: STALE.reference,
  });
}

/** Ein neuer Link; der bisherige gilt ab jetzt nicht mehr. */
export function useReplaceInviteLink() {
  const { hauskreisId, keys } = useHk();
  const queryClient = useQueryClient();

  return useApiMutation(
    (validDays: InviteLinkValidDays) =>
      inviteLinksApi.replaceInviteLink(hauskreisId, validDays),
    {
      // Die Antwort *ist* der neue Stand; ein zweiter Abruf zeigte nur
      // dasselbe eine halbe Sekunde später.
      onSuccess: (state) => queryClient.setQueryData(keys.inviteLink, state),
    },
  );
}

export function useRemoveInviteLink() {
  const { hauskreisId, keys } = useHk();
  const queryClient = useQueryClient();

  return useApiMutation(() => inviteLinksApi.removeInviteLink(hauskreisId), {
    onSuccess: () => queryClient.setQueryData(keys.inviteLink, { link: null }),
  });
}

/**
 * Wohin ein Link führt — **ohne Anmeldung**, deshalb ohne `useApiReady`.
 *
 * `404` ist hier kein Fehler zum Wiederholen, sondern die Auskunft „dieser
 * Link gilt nicht mehr". Ein Retry hätte nur dieselbe Antwort später.
 */
export function useResolveInviteLink(code: string | null) {
  const query = useQuery({
    queryKey: qk.inviteLinkTarget(code ?? ''),
    queryFn: () => inviteLinksApi.resolveInviteLink(code!),
    enabled: Boolean(code),
    staleTime: STALE.reference,
    retry: false,
  });

  return { ...query, gone: isStatus(query.error, 404) };
}

/**
 * Beitreten. Danach ist alles anders — Hauskreis, Rolle, jede Liste —, also
 * wie beim Annehmen einer Einladung: Cache leeren statt einzeln nachziehen.
 *
 * `silent`, weil zwei der Antworten keine Fehler sind, sondern Fragen: `409`
 * („willst du wirklich wechseln?") und `400` („wer übernimmt?"). Die
 * Oberfläche entscheidet selbst, was sie daraus macht.
 */
export function useJoinViaLink() {
  const queryClient = useQueryClient();

  return useApiMutation(
    (input: JoinViaLinkInput) => inviteLinksApi.joinViaLink(input),
    { silent: true, onSuccess: () => queryClient.clear() },
  );
}
