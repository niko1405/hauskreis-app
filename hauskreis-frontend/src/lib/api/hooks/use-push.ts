'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiReady } from '../../auth/auth-bridge';
import { pushApi } from '../endpoints';
import { qk } from '../query-keys';
import type {
  NotificationType,
  UpdateNotificationSettingInput,
} from '../types';
import { useApiMutation } from './use-resource';

const HOUR = 60 * 60 * 1000;

/**
 * `enabled: false` in der Antwort heißt: im Backend ist kein VAPID-Schlüssel
 * hinterlegt. Das `enabled` der Abfrage selbst hängt dagegen am Token — die
 * Push-Routen sind nicht hauskreisgebunden und hätten sonst keine Bremse.
 */
export function usePushPublicKey() {
  const ready = useApiReady();

  return useQuery({
    queryKey: qk.push.publicKey,
    queryFn: ({ signal }) => pushApi.getPushPublicKey(signal),
    enabled: ready,
    staleTime: HOUR,
  });
}

export function useNotificationSettings() {
  const ready = useApiReady();

  return useQuery({
    queryKey: qk.push.settings,
    queryFn: ({ signal }) => pushApi.listNotificationSettings(signal),
    enabled: ready,
  });
}

/** Ohne Vorbedingung. */
export function useUpdateNotificationSetting() {
  return useApiMutation(
    ({
      type,
      input,
    }: {
      type: NotificationType;
      input: UpdateNotificationSettingInput;
    }) => pushApi.updateNotificationSetting(type, input),
    { invalidateKeys: [qk.push.settings] },
  );
}

export function usePushSubscriptions() {
  const ready = useApiReady();

  return useQuery({
    queryKey: qk.push.subscriptions,
    queryFn: ({ signal }) => pushApi.listPushSubscriptions(signal),
    enabled: ready,
  });
}

export function useSendTestNotification() {
  return useApiMutation(() => pushApi.sendTestNotification());
}
