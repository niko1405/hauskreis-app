import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Ein Gebetsanliegen ist ein Text und sonst nichts.
 *
 * Keine Personen-Id im Körper, und das ist die eigentliche Absicherung: Die
 * Route heißt `…/prayer-requests/mine`, der Server nimmt die Person aus dem
 * Token. Es gibt schlicht nichts zu fälschen — „nur die eigene" lässt sich
 * damit nicht umgehen, auch nicht von einer Admin-Person.
 *
 * Die Obergrenze ist großzügig und trotzdem da. Ein Anliegen sind ein paar
 * Sätze; 2000 Zeichen sind so viel, dass niemand sie im Alltag erreicht, und so
 * wenig, dass niemand die Karte des Abends mit einem Roman füllt.
 */
export const upsertPrayerRequestSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

const prayerRequestParamsSchema = z.object({
  hauskreisId: z.uuid(),
  meetingId: z.uuid(),
});

export class UpsertPrayerRequestDto extends createZodDto(
  upsertPrayerRequestSchema,
) {}
export class PrayerRequestParamsDto extends createZodDto(
  prayerRequestParamsSchema,
) {}
