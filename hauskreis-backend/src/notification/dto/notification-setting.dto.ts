import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { NotificationType } from '../../../generated/prisma/enums';

export const notificationSettingParamsSchema = z.object({
  type: z.enum(NotificationType),
});

export const updateNotificationSettingSchema = z.object({
  enabled: z.boolean().optional(),
  /// Days before the meeting. `null` returns to the catalog default; the
  /// allowed range depends on the type and is checked against the catalog,
  /// not here.
  leadDays: z.coerce.number().int().min(1).max(31).nullish(),
  /// Wochentage, 0 = Sonntag. Mehrere sind erlaubt — eine Nachfrage zur
  /// Wochenmitte und eine kurz vor dem nächsten Abend sind verschiedene
  /// Erinnerungen. `null` oder leer bringt die Person zurück zum Katalog.
  weekdays: z.array(z.coerce.number().int().min(0).max(6)).max(7).nullish(),
});

export class NotificationSettingParamsDto extends createZodDto(
  notificationSettingParamsSchema,
) {}
export class UpdateNotificationSettingDto extends createZodDto(
  updateNotificationSettingSchema,
) {}
