import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { isoDateOut } from '../../common/dto/response';

/**
 * Der Überblick über alles Vergangene.
 *
 * Nur Zahlen und Jahre — die Inhalte holt man sich über `…/meetings?scope=past`,
 * `…/topics` und `…/songs`, wo es Filter und Paginierung gibt. Diese Route ist
 * die Einstiegsseite des Archivs, nicht das Archiv selbst.
 */
export const archiveSummarySchema = z.object({
  /// Absteigend, neuestes Jahr zuerst.
  years: z.array(
    z.object({
      year: z.number().int(),
      meetings: z.number().int().nonnegative(),
    }),
  ),
  totals: z.object({
    meetings: z.number().int().nonnegative(),
    /// Themen, von denen mindestens ein Abend war — was im Register „Alle" steht.
    topics: z.number().int().nonnegative(),
    /// Die eigenen, auch die noch nicht gehaltenen. **Keine** Teilmenge von
    /// `topics`: ein eigener Entwurf steht hier drin und dort nicht.
    topicsMine: z.number().int().nonnegative(),
    /// Die Vereinigung beider Register — was die Kachel „Themen" zeigt. Nicht
    /// die Summe: ein eigenes, gehaltenes Thema steht in beiden.
    topicsTotal: z.number().int().nonnegative(),
    /// Alle je vorgeschlagenen Lieder.
    songs: z.number().int().nonnegative(),
    /// Davon die, die auch wirklich gesungen wurden.
    songsPlayed: z.number().int().nonnegative(),
  }),
  /// `null`, solange es keinen einzigen Termin gibt.
  firstMeetingDate: isoDateOut.nullable(),
});

export class ArchiveSummaryResponseDto extends createZodDto(
  archiveSummarySchema,
) {}
