'use client';

/**
 * Die Box hinter der Glocke.
 *
 * Nicht hauskreisgebunden — wie `use-push`, und aus demselben Grund:
 * Benachrichtigungen hängen am angemeldeten Menschen.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useApiReady } from '../../auth/auth-bridge';
import { STALE } from '../cache';
import { notificationsApi } from '../endpoints';
import { qk } from '../query-keys';

export function useInbox() {
  // Wie die Push-Hooks: erst fragen, wenn ein Token bereitliegt. Die Glocke
  // steht auf jedem Tab und wäre sonst der erste Aufruf jeder Sitzung — mit
  // einem 401, der sich zwar von selbst erholt, aber eine Runde kostet.
  const ready = useApiReady();

  return useQuery({
    queryKey: qk.inbox,
    queryFn: ({ signal }) => notificationsApi.getInbox(signal),
    enabled: ready,
    staleTime: STALE.home,
  });
}

/**
 * Gelesen — und die Box lädt neu.
 *
 * Kein `useApiMutation`: Der übliche Auslöser ist ein Antippen der
 * Push-Nachricht, und dabei fällt der Aufruf **beim Start der App** an. Ein
 * Fehler-Toast über eine Nachricht, die man gerade weggetippt hat, wäre ein
 * merkwürdiger Empfang; die Zahl an der Glocke sagt beim nächsten Laden ohnehin
 * die Wahrheit. Deshalb still.
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => notificationsApi.markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.inbox }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => notificationsApi.markAllNotificationsRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.inbox }),
  });
}

/**
 * Kommt eine Benachrichtigung an, während die App offen ist, soll die Zahl an
 * der Glocke sofort stimmen.
 *
 * Der Service Worker meldet sich dafür (`sw.ts`), denn das `push`-Ereignis
 * erreicht die Seite nicht — es geht an den Worker. Ohne das stünde die alte
 * Zahl bis zum nächsten Ziehen-zum-Aktualisieren da.
 *
 * Nach dem Vorbild des Listeners für `push-subscription-changed` in
 * `use-push-setup.ts`.
 */
export function useInboxLiveUpdates(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string } | undefined;
      if (data?.type !== 'notification-received') return;
      void queryClient.invalidateQueries({ queryKey: qk.inbox });
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [queryClient]);
}
