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
 * Der Text selbst wird hier nie gespeichert — `lyricsUrl` zeigt nach draußen.
 * Wer Text und Akkorde für sich hinterlegt, tut das im eigenen Gerät; davon
 * erfährt der Server nichts (CLAUDE.md §6.7).
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
 * Ein Lied für seine eigene Seite: die Zahlen der Liste und dazu, an wie
 * vielen Abenden es überhaupt steht — Vorschläge eingeschlossen. Daran hängt,
 * ob es sich löschen lässt (`SongService.remove`).
 */
export const songDetailSchema = songWithFactsSchema.extend({
  meetingCount: z.number().int().nonnegative(),
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
  /// Der Platz in der Setlist, ab 1 — `null` für einen Vorschlag.
  position: z.int().nullable(),
  /// Wie viele dafür gestimmt haben, und ob du dabei bist. Wer die anderen
  /// sind, steht nicht drin: Gefragt ist „wie sehr wollen wir das", nicht
  /// „wer will es".
  votes: z.int(),
  votedByMe: z.boolean(),
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
/// `GET`, `POST` und `PATCH` liefern das Lied mit seinen Zahlen: Die Liedseite
/// ist der Ort, an dem man nach ihnen sucht.
export class SongResponseDto extends createZodDto(songDetailSchema) {}
export class MeetingSongListResponseDto extends createZodDto(
  z.array(meetingSongResponseSchema),
) {}
export class MeetingSongResponseDto extends createZodDto(
  meetingSongResponseSchema,
) {}
export class SongLeadersResponseDto extends createZodDto(
  songLeadersResponseSchema,
) {}
