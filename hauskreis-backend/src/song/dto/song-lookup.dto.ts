import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Der Link, aus dem Titel und Interpret gelesen werden sollen.
 *
 * Dieselbe Obergrenze wie bei `lyricsUrl` in `song.dto.ts` — was hier
 * hineingeht, landet am Ende genau dort.
 */
export const metadataFromLinkSchema = z.object({
  url: z.url().max(2000),
});

/**
 * Wonach ein Link gesucht werden soll. Ohne Interpret geht es auch, mit ihm
 * wird das Ergebnis deutlich besser.
 */
export const lyricsLinkSearchSchema = z.object({
  title: z.string().trim().min(2).max(200),
  artist: z.string().trim().min(1).max(200).nullish(),
  /**
   * Der zweite Druck auf denselben Knopf.
   *
   * `false` liefert, was schon gefunden wurde, ohne noch einmal zu bezahlen.
   * `true` sucht **zusätzlich** und gezielt neben dem Bekannten — dafür kostet
   * jeder Druck wieder einen Aufruf, und das ist so gemeint: es ist eine
   * ausdrückliche Handlung, kein Nachladen im Hintergrund.
   */
  more: z.boolean().default(false),
});

export class MetadataFromLinkDto extends createZodDto(metadataFromLinkSchema) {}
export class LyricsLinkSearchDto extends createZodDto(lyricsLinkSearchSchema) {}
