/**
 * `/api/notifications` — die Box hinter der Glocke.
 *
 * **Nicht unter `/push`**, obwohl sie aus derselben Tabelle liest: Ein Eintrag
 * entsteht auch dann, wenn die Art in den Einstellungen abgeschaltet ist. In
 * der Box zu stehen stört niemanden.
 *
 * Personengebunden wie `/push/*` und deshalb ohne `hauskreisId` im Pfad.
 */
import { apiGet, apiPostVoid } from '../client';
import type { NotificationInbox } from '../types';

export function getInbox(signal?: AbortSignal): Promise<NotificationInbox> {
  return apiGet<NotificationInbox>('/notifications', { signal });
}

/** Idempotent — dieselbe Nachricht auf zwei Geräten wegzutippen ist Alltag. */
export function markNotificationRead(id: string): Promise<void> {
  return apiPostVoid(`/notifications/${id}/read`);
}

export function markAllNotificationsRead(): Promise<void> {
  return apiPostVoid('/notifications/read-all');
}
