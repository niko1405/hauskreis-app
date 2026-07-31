import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { isoDateTimeOut } from '../../common/dto/response';

/**
 * Ein Ort, an dem sich der Hauskreis trifft — meist ein Zuhause, manchmal der
 * Schlosspark.
 */
export const locationResponseSchema = z.object({
  id: z.uuid(),
  hauskreisId: z.uuid(),
  name: z.string(),
  /// Wie oft dieser Ort im Verhältnis zu den anderen drankommen soll. Hängt am
  /// Zuhause, nicht an der Person: zwei Bewohner teilen sich ein Gewicht.
  /// `0` hält einen Ort in der Liste, ohne dass er je vorgeschlagen wird.
  hostWeight: z.number(),
  /// Wie viele Platz haben. `null` heißt „alle passen rein", der Normalfall —
  /// nur die engen Wohnungen brauchen eine Zahl.
  capacity: z.number().int().positive().nullable(),
  /// Falsch für Orte wie den Schlosspark: solche Abende haben gar keinen Host,
  /// und das ist ein gültiger Zustand, kein fehlender Wert.
  requiresHost: z.boolean(),
  /// Für „In Maps öffnen". Entweder beide gesetzt oder beide `null`.
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  address: z.string().nullable(),
  active: z.boolean(),
  createdAt: isoDateTimeOut,
  version: z.number().int().nonnegative(),
});

export class LocationResponseDto extends createZodDto(locationResponseSchema) {}
export class LocationListResponseDto extends createZodDto(
  z.array(locationResponseSchema),
) {}
