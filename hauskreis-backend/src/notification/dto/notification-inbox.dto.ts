import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const notificationEntryParamsSchema = z.object({
  id: z.uuid(),
});

export class NotificationEntryParamsDto extends createZodDto(
  notificationEntryParamsSchema,
) {}
