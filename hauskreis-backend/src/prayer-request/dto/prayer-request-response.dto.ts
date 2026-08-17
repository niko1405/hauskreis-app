import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { isoDateTimeOut, personRefSchema } from '../../common/dto/response';

/**
 * Ein Gebetsanliegen, so wie es alle im Hauskreis sehen.
 *
 * Mit `person`, weil ein Anliegen ohne Absender keines ist — man betet für
 * jemanden, nicht für einen Text. Genau deshalb steht hier auch kein
 * anonymer Modus zur Wahl: Wer sein Anliegen nicht mit seinem Namen teilen
 * möchte, teilt es nicht in einer App.
 *
 * `updatedAt` statt `createdAt`: Interessant ist, wann zuletzt etwas dastand.
 */
export const prayerRequestResponseSchema = z.object({
  person: personRefSchema,
  text: z.string(),
  updatedAt: isoDateTimeOut,
});

export const prayerRequestListResponseSchema = z.array(
  prayerRequestResponseSchema,
);

export class PrayerRequestResponseDto extends createZodDto(
  prayerRequestResponseSchema,
) {}
export class PrayerRequestListResponseDto extends createZodDto(
  prayerRequestListResponseSchema,
) {}
