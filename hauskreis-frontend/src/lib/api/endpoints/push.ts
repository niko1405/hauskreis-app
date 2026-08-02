/**
 * `/api/push/*` — als einziger Bereich **nicht** hauskreisgebunden, weil
 * Abonnements und Einstellungen am angemeldeten Menschen hängen, nicht an
 * der Gruppe.
 */
import { apiDelete, apiGet, apiPost, apiPut, UNCONDITIONAL } from '../client';
import type {
  CreatePushSubscriptionInput,
  DeliveryResult,
  NotificationSetting,
  NotificationType,
  PushPublicKey,
  PushSubscriptionRecord,
  UpdateNotificationSettingInput,
} from '../types';

/** `enabled: false` heißt: im Backend ist kein VAPID-Schlüsselpaar hinterlegt. */
export function getPushPublicKey(signal?: AbortSignal): Promise<PushPublicKey> {
  return apiGet<PushPublicKey>('/push/public-key', { signal });
}

export function listNotificationSettings(
  signal?: AbortSignal,
): Promise<NotificationSetting[]> {
  return apiGet<NotificationSetting[]>('/push/settings', { signal });
}

/** Ohne Vorbedingung — die Route deklariert weder `412` noch `428`. */
export function updateNotificationSetting(
  type: NotificationType,
  input: UpdateNotificationSettingInput,
): Promise<NotificationSetting> {
  return apiPut<NotificationSetting>(
    `/push/settings/${type}`,
    input,
    UNCONDITIONAL,
  ).then((r) => r.data);
}

export function listPushSubscriptions(
  signal?: AbortSignal,
): Promise<PushSubscriptionRecord[]> {
  return apiGet<PushSubscriptionRecord[]>('/push/subscriptions', { signal });
}

/**
 * `subscription.toJSON()` passt 1:1 auf den Körper. Den `user-agent`-Header
 * setzt der Browser selbst — nicht überschreiben.
 */
export function createPushSubscription(
  input: CreatePushSubscriptionInput,
): Promise<PushSubscriptionRecord> {
  return apiPost<PushSubscriptionRecord>('/push/subscriptions', input);
}

/** `DELETE` mit Körper: der Endpunkt identifiziert das Abo über seine URL. */
export function deletePushSubscription(endpoint: string): Promise<void> {
  return apiDelete('/push/subscriptions', { endpoint });
}

export function sendTestNotification(): Promise<DeliveryResult> {
  return apiPost<DeliveryResult>('/push/test');
}
