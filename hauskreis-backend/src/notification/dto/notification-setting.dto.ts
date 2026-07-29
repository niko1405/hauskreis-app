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
  /// 0 = Sunday, 6 = Saturday. `null` returns to the catalog default.
  weekday: z.coerce.number().int().min(0).max(6).nullish(),
});

export class NotificationSettingParamsDto extends createZodDto(
  notificationSettingParamsSchema,
) {}
export class UpdateNotificationSettingDto extends createZodDto(
  updateNotificationSettingSchema,
) {}
