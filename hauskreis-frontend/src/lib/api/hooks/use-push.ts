'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiReady } from '../../auth/auth-bridge';
import { pushApi } from '../endpoints';
import { qk } from '../query-keys';
import type {
  NotificationSetting,
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

/** Ohne Vorbedingung. Häkchen und Wochentage sollen sofort umspringen. */
export function useUpdateNotificationSetting() {
  return useApiMutation(
    ({
      type,
      input,
    }: {
      type: NotificationType;
      input: UpdateNotificationSettingInput;
    }) => pushApi.updateNotificationSetting(type, input),
    {
      invalidateKeys: [qk.push.settings],
      // `null` heißt „zurück auf den Katalog-Standard" — welcher das ist, weiß
      // nur der Server. Vorgegriffen wird deshalb nur bei gesetzten Werten;
      // das Zurücksetzen wartet die Antwort ab.
      optimistic: ({ type, input }, patch) =>
        patch<NotificationSetting[]>(qk.push.settings, (settings) =>
          settings.map((setting) =>
            setting.type === type
              ? {
                  ...setting,
                  ...(input.enabled !== undefined && {
                    enabled: input.enabled,
                  }),
                  ...(input.leadDays !== undefined && {
                    leadDays: input.leadDays,
                  }),
                  ...(input.weekdays != null && { weekdays: input.weekdays }),
                }
              : setting,
          ),
        ),
    },
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
