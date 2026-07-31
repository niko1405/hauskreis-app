import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  isoDateOut,
  isoDateTimeOut,
  pageSchema,
  personRefSchema,
} from '../../common/dto/response';

/**
 * Ein Lied aus der Sammlung, die mit der Zeit von allein entsteht.
 *
 * Der Text selbst wird nicht gespeichert — `lyricsUrl` zeigt nach draußen.
 */
export const songResponseSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  artist: z.string().nullable(),
  lyricsUrl: z.url().nullable(),
  createdAt: isoDateTimeOut,
  version: z.number().int().nonnegative(),
  /// Wer es zuerst vorgeschlagen hat. `null`, wenn die Person nicht mehr dabei
  /// ist — das Lied bleibt, die Zuordnung fällt weg.
  createdBy: personRefSchema.nullable(),
});

/**
 * Dasselbe mit den beiden Zahlen, nach denen sich sortieren lässt.
 *
 * Gezählt wird nur, was auch **gesungen** wurde (`isSelected`), nicht jeder
 * Vorschlag — sonst stünde oben, was oft vorgeschlagen und nie genommen wurde.
 */
export const songWithFactsSchema = songResponseSchema.extend({
  timesPlayed: z.number().int().nonnegative(),
  /// Hier wirklich nur der Tag: der Dienst schneidet ihn selbst zu.
  lastPlayedAt: isoDateOut.nullable(),
});

/**
 * Ein Lied an einem bestimmten Abend.
 *
 * `isSelected` unterscheidet den Vorschlag vom tatsächlich Gesungenen. Beides
 * steht in derselben Liste, weil beides zum Abend gehört.
 */
export const meetingSongResponseSchema = z.object({
  id: z.uuid(),
  isSelected: z.boolean(),
  createdAt: isoDateTimeOut,
  song: z.object({
    id: z.uuid(),
    title: z.string(),
    artist: z.string().nullable(),
    lyricsUrl: z.url().nullable(),
  }),
  suggestedBy: personRefSchema.nullable(),
});

/**
 * Wer an einem Abend für die Musik zuständig ist.
 *
 * Eine schlichte Liste, auch mehrere möglich — und eine leere ist gültig: nicht
 * jeder Abend hat Lieder, dann braucht es niemanden (CLAUDE.md §6).
 */
export const songLeadersResponseSchema = z.array(personRefSchema);

export class SongPageResponseDto extends createZodDto(
  pageSchema(songWithFactsSchema),
) {}
/// `findOne`, `create` und `update` liefern das Lied ohne die beiden Zahlen —
/// die entstehen nur in der Liste, wo ohnehin über alle Vorkommen gezählt wird.
export class SongResponseDto extends createZodDto(songResponseSchema) {}
export class MeetingSongListResponseDto extends createZodDto(
  z.array(meetingSongResponseSchema),
) {}
export class MeetingSongResponseDto extends createZodDto(
  meetingSongResponseSchema,
) {}
export class SongLeadersResponseDto extends createZodDto(
  songLeadersResponseSchema,
) {}
