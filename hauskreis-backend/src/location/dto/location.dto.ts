import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Beide Koordinaten oder keine.
 *
 * Eine Breite ohne Länge zeigt auf nichts — das Frontend könnte daraus keine
 * Karten-URL bauen und müsste den Fall trotzdem behandeln. Lieber hier
 * ablehnen, als eine halbe Position zu speichern.
 */
function bothOrNeitherCoordinate<
  T extends { latitude?: number | null; longitude?: number | null },
>(value: T, ctx: z.RefinementCtx): void {
  const hasLatitude = value.latitude !== null && value.latitude !== undefined;
  const hasLongitude =
    value.longitude !== null && value.longitude !== undefined;

  if (hasLatitude !== hasLongitude) {
    ctx.addIssue({
      code: 'custom',
      message: 'latitude und longitude müssen zusammen gesetzt werden',
      path: [hasLatitude ? 'longitude' : 'latitude'],
    });
  }
}

const coordinateFields = {
  /// Nord/Süd. Nullish, weil ein Ort auch ohne Position brauchbar ist — und
  /// weil `null` ihn wieder entfernen können muss.
  latitude: z.number().min(-90).max(90).nullish(),
  /// Ost/West.
  longitude: z.number().min(-180).max(180).nullish(),
  /// Freitext, so wie man ihn jemandem diktieren würde.
  address: z.string().trim().min(1).max(200).nullish(),
};

/**
 * Die Felder ohne Prüfregel. Getrennt gehalten, weil sich an ein verfeinertes
 * Schema in Zod 4 kein `.partial()` mehr anhängen lässt — `innerType()` gibt es
 * nicht mehr. Die Regel kommt deshalb unten an beide Varianten einzeln.
 */
const locationFields = z.object({
  name: z.string().trim().min(1).max(100),
  /// Higher means "meet here more often". 0 keeps a home on the list without
  /// it ever being suggested. Ignored when `requiresHost` is false — places
  /// without a host are outside the fairness ranking.
  hostWeight: z.number().min(0).max(99).default(1),
  /// How many people fit. Null/omitted means no meaningful limit — only the
  /// tight homes need a number.
  capacity: z.number().int().positive().max(200).nullish(),
  requiresHost: z.boolean().default(true),
  ...coordinateFields,
});

export const createLocationSchema = locationFields.superRefine(
  bothOrNeitherCoordinate,
);

export const updateLocationSchema = locationFields
  .partial()
  .extend({ active: z.boolean().optional() })
  .superRefine(bothOrNeitherCoordinate);

const locationParamsSchema = z.object({
  hauskreisId: z.uuid(),
  id: z.uuid(),
});

export class CreateLocationDto extends createZodDto(createLocationSchema) {}
export class UpdateLocationDto extends createZodDto(updateLocationSchema) {}
export class LocationParamsDto extends createZodDto(locationParamsSchema) {}
