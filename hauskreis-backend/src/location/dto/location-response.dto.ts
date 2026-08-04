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
  /// Wer hier wohnt. Leer bei Orten ohne Gastgeber (Schlosspark) und bei
  /// Wohnungen, aus denen alle ausgezogen sind.
  ///
  /// Daran hängen zwei Dinge im Frontend: der Name („Bei Niko & Chris" wird
  /// hieraus abgeleitet, nicht von Hand getippt) und der WG-Hinweis im Profil.
  residents: z.array(z.object({ id: z.uuid(), name: z.string() })),
  active: z.boolean(),
  createdAt: isoDateTimeOut,
  version: z.number().int().nonnegative(),
});

/**
 * Antwort auf „gibt es diese Anschrift schon?".
 *
 * `location: null` heißt: neue Wohnung. Steht dort eine, ist es entweder ein
 * Umzug in eine bestehende Wohngemeinschaft oder ein Tippfehler — was davon,
 * entscheidet die Person, nicht der Server.
 */
export const resolveAddressResponseSchema = z.object({
  /// Die normalisierte Fassung, nach der gesucht wurde. Nützlich beim
  /// Nachvollziehen, warum zwei Schreibweisen als dieselbe Wohnung gelten.
  addressKey: z.string(),
  location: locationResponseSchema.nullable(),
});

/**
 * Was aus dem Stilllegen wurde.
 *
 * `deleted: false` heißt: an dem Ort hing noch ein Termin, also blieb es beim
 * `active = false`. Die Oberfläche sagt danach das Richtige, statt „gelöscht"
 * zu behaupten und den Ort weiter anzuzeigen.
 */
export const removalResultSchema = z.object({
  deleted: z.boolean(),
});

/** Wie viele Karteileichen der Wartungslauf weggeräumt hat. */
export const purgeResultSchema = z.object({
  deleted: z.number().int().nonnegative(),
});

export class LocationResponseDto extends createZodDto(locationResponseSchema) {}
export class RemovalResultDto extends createZodDto(removalResultSchema) {}
export class PurgeResultDto extends createZodDto(purgeResultSchema) {}
export class LocationListResponseDto extends createZodDto(
  z.array(locationResponseSchema),
) {}
export class ResolveAddressResponseDto extends createZodDto(
  resolveAddressResponseSchema,
) {}
