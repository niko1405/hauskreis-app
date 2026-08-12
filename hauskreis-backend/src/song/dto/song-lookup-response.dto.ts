import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Ob die Lied-Suche überhaupt eingerichtet ist.
 *
 * Dasselbe Muster wie bei `GET /api/push/public-key`: Das Frontend fragt
 * einmal und blendet die Knöpfe aus, statt sie anzubieten und dann an einem
 * fehlenden Schlüssel zu scheitern.
 */
export const songLookupStatusSchema = z.object({
  enabled: z.boolean(),
});

/**
 * Was auf einer verlinkten Seite steht. Beide Felder dürfen `null` sein — eine
 * Seite, auf der nichts Eindeutiges steht, ist ein normaler Ausgang und kein
 * Fehler.
 */
export const songMetadataResponseSchema = z.object({
  title: z.string().nullable(),
  artist: z.string().nullable(),
});

/**
 * Gefundene Links, höchstens drei, bevorzugte Seiten zuerst.
 *
 * Jede URL wurde vor der Rückgabe abgerufen — was hier steht, gibt es auch.
 * Eine leere Liste heißt schlicht: nichts gefunden.
 */
export const lyricsLinkCandidatesResponseSchema = z.object({
  candidates: z.array(
    z.object({
      url: z.url(),
      title: z.string().nullable(),
      artist: z.string().nullable(),
      /// Der Hostname ohne `www.` — mehr braucht die Liste nicht anzuzeigen.
      site: z.string(),
    }),
  ),
});

export class SongLookupStatusResponseDto extends createZodDto(
  songLookupStatusSchema,
) {}
export class SongMetadataResponseDto extends createZodDto(
  songMetadataResponseSchema,
) {}
export class LyricsLinkCandidatesResponseDto extends createZodDto(
  lyricsLinkCandidatesResponseSchema,
) {}
