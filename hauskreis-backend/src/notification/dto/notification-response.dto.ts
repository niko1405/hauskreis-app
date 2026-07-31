import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { isoDateTimeOut } from '../../common/dto/response';
import { NotificationType } from '../../../generated/prisma/enums';

/**
 * Wie oft eine Benachrichtigung kommt — drei Formen, danach richtet sich, was
 * die Einstellungsseite anbieten muss.
 */
const scheduleSchema = z.discriminatedUnion('kind', [
  z.object({
    /// Kommt vor einem Termin; wie lange vorher, entscheidet die Person.
    kind: z.literal('LEAD_TIME'),
    defaultLeadDays: z.number().int(),
    minLeadDays: z.number().int(),
    maxLeadDays: z.number().int(),
  }),
  z.object({
    /// Kommt an einem Wochentag. 0 = Sonntag, 6 = Samstag, wie
    /// `Date.getUTCDay()`.
    kind: z.literal('WEEKLY'),
    defaultWeekday: z.number().int().min(0).max(6),
  }),
  z.object({
    /// Kommt, wenn etwas passiert. Nur an oder aus.
    kind: z.literal('EVENT'),
  }),
]);

/**
 * Eine Einstellung, wie sie für diese Person tatsächlich gilt.
 *
 * Gespeichert wird nur, was jemand *abweichend* eingestellt hat; ohne Zeile
 * gelten die Werte aus dem Katalog. Deshalb `customised`: daran erkennt die
 * Oberfläche, ob sie einen bewussten Wunsch anzeigt oder eine Voreinstellung.
 */
export const notificationSettingSchema = z.object({
  type: z.enum(NotificationType),
  /// Überschrift in der Einstellungsliste.
  label: z.string(),
  /// Beantwortet „warum bekomme ich das", im Ton der App.
  description: z.string(),
  schedule: scheduleSchema,
  enabled: z.boolean(),
  /// Nur bei `LEAD_TIME` gesetzt.
  leadDays: z.number().int().nullable(),
  /// Nur bei `WEEKLY` gesetzt.
  weekday: z.number().int().min(0).max(6).nullable(),
  customised: z.boolean(),
});

/** Ein angemeldetes Gerät. Die Schlüssel bleiben serverseitig. */
export const pushSubscriptionSchema = z.object({
  id: z.uuid(),
  endpoint: z.url(),
  /// Woran man das Gerät wiedererkennt, soweit der Browser es verrät.
  userAgent: z.string().nullable(),
  createdAt: isoDateTimeOut,
});

/**
 * Der VAPID-Schlüssel für `pushManager.subscribe()`.
 *
 * `enabled: false` heißt, dass der Server ohne Schlüsselpaar läuft — dann ist
 * `publicKey` null und Push schlicht abgeschaltet. Kein Fehler, ein Zustand.
 */
export const pushPublicKeySchema = z.object({
  publicKey: z.string().nullable(),
  enabled: z.boolean(),
});

/** Was beim Zustellversuch herauskam. */
export const deliveryResultSchema = z.object({
  delivered: z.number().int().nonnegative(),
  /// Endpunkte, die der Push-Dienst als tot gemeldet hat und die daraufhin
  /// entfernt wurden.
  pruned: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

export class NotificationSettingListResponseDto extends createZodDto(
  z.array(notificationSettingSchema),
) {}
export class NotificationSettingResponseDto extends createZodDto(
  notificationSettingSchema,
) {}
export class PushSubscriptionListResponseDto extends createZodDto(
  z.array(pushSubscriptionSchema),
) {}
export class PushSubscriptionResponseDto extends createZodDto(
  pushSubscriptionSchema,
) {}
export class PushPublicKeyResponseDto extends createZodDto(
  pushPublicKeySchema,
) {}
export class DeliveryResultResponseDto extends createZodDto(
  deliveryResultSchema,
) {}
