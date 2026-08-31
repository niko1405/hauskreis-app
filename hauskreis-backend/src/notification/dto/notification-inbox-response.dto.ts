import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { isoDateTimeOut } from '../../common/dto/response';
import { NotificationType } from '../../../generated/prisma/enums';

/**
 * Ein Eintrag in der Box hinter der Glocke.
 *
 * Titel und Text stehen so drin, wie sie verschickt wurden, und werden hier
 * **nicht** neu gebaut. Der Grund ist derselbe wie beim Archiv: Was gestern
 * dastand, soll morgen noch dasselbe sagen — auch wenn der Termin inzwischen
 * verschoben oder die Rolle neu vergeben wurde.
 *
 * `url` ist der Weg zurück in die App (`app-paths.ts`) und darf fehlen: Nicht
 * jede Nachricht hat einen Ort, an den sie führt.
 */
export const notificationEntrySchema = z.object({
  id: z.uuid(),
  type: z.enum(NotificationType),
  title: z.string(),
  body: z.string(),
  url: z.string().nullable(),
  /// Wann die Sache aufkam — die Sortierung der Box, neueste zuerst.
  sentAt: isoDateTimeOut,
  readAt: isoDateTimeOut.nullable(),
});

/**
 * Was die Glocke braucht: die Zahl daneben und beide Hälften der Box.
 *
 * `unreadCount` steht eigens da und wird nicht aus `unread.length` gelesen —
 * die Liste ist gedeckelt, die Zahl nicht. Bei 120 ungelesenen Nachrichten
 * stünde sonst „30" am Symbol.
 */
export const notificationInboxSchema = z.object({
  unreadCount: z.number().int().nonnegative(),
  unread: z.array(notificationEntrySchema),
  /// „Früher" — was schon gelesen wurde, auf die jüngsten begrenzt. Gelesenes
  /// verschwindet aus der Box, aber nicht aus der Welt.
  read: z.array(notificationEntrySchema),
});

export class NotificationInboxResponseDto extends createZodDto(
  notificationInboxSchema,
) {}
