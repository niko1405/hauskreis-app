import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  isoDateOut,
  isoDateTimeOut,
  pageSchema,
  personRefSchema,
} from '../../common/dto/response';

/**
 * Eine Runde Gebetsbuddys: ein Zeitraum, darin mehrere Gruppen.
 *
 * Neun Personen gehen nicht glatt in Zweiergruppen auf, deshalb sind nicht alle
 * Gruppen gleich groß — eine Dreiergruppe ist der Normalfall, kein Fehler.
 * Größer als drei wird keine.
 *
 * Die Daten sind hier reine Kalendertage: der Dienst schneidet sie selbst zu,
 * anders als bei den Terminen.
 */
export const prayerBuddyAssignmentSchema = z.object({
  periodStart: isoDateOut,
  /// Einschließlich.
  periodEnd: isoDateOut,
  groups: z.array(
    z.object({
      id: z.uuid(),
      /// Die Besetzung **in Kreis-Reihenfolge** — das ist Teil der Zusage und
      /// kein Zufall der Abfrage: Wer hier steht, betet für den Nächsten, der
      /// Letzte für den Ersten.
      ///
      /// Bei einem Paar heißt das schlicht „füreinander". Bei einem Trio sagt
      /// es wirklich etwas: A betet für B, B für C, C für A — und niemand muss
      /// sich das aus einer Namensliste selbst zusammenreimen.
      members: z.array(personRefSchema),
    }),
  ),
});

/**
 * Der Rhythmus, in dem neu zugeteilt wird.
 *
 * Eine Änderung gilt ab der **nächsten** Rotation — der laufenden Zuteilung
 * werden nicht mitten im Zeitraum die Buddys unter den Füßen weggezogen.
 */
export const prayerBuddyConfigSchema = z.object({
  id: z.uuid(),
  hauskreisId: z.uuid(),
  periodLengthWeeks: z.number().int().min(1).max(12),
  updatedByPersonId: z.uuid().nullable(),
  updatedAt: isoDateTimeOut,
  version: z.number().int().nonnegative(),
  updatedBy: personRefSchema.nullable(),
});

/** Was eine von Hand ausgelöste Rotation bewirkt hat. */
export const rotationResultSchema = z.object({
  /// `null`, wenn nichts zu tun war oder zu wenige Leute für Paare da sind.
  assignment: prayerBuddyAssignmentSchema.nullable(),
  /// Ob jetzt eine **andere** Runde läuft als vorher — egal ob frisch gebaut
  /// oder aus dem Vorlauf vorgezogen. Für die Fragende ist es dasselbe.
  created: z.boolean(),
  notified: z.number().int().nonnegative(),
});

/** Wie viele Runden der Vorauslauf ergänzt hat. */
export const planningResultSchema = z.object({
  created: z.number().int().nonnegative(),
});

export class PrayerBuddyAssignmentResponseDto extends createZodDto(
  prayerBuddyAssignmentSchema,
) {}
/**
 * Für `…/prayer-buddies/current`, das auch `null` liefern darf, wenn für heute
 * niemand zugeteilt ist — ein gültiger Zustand, kein Fehler.
 *
 * `createZodDto` nimmt nur Objekt-Schemas, deshalb steht hier dasselbe wie
 * oben. Den `null`-Fall lässt der Serializer ohnehin unangetastet durch; in der
 * Beschreibung steht er in der Erläuterung der Route.
 */
export class CurrentPrayerBuddyResponseDto extends createZodDto(
  prayerBuddyAssignmentSchema,
) {}
export class PrayerBuddyPageResponseDto extends createZodDto(
  pageSchema(prayerBuddyAssignmentSchema),
) {}
export class PrayerBuddyConfigResponseDto extends createZodDto(
  prayerBuddyConfigSchema,
) {}
export class RotationResultResponseDto extends createZodDto(
  rotationResultSchema,
) {}
export class PlanningResultResponseDto extends createZodDto(
  planningResultSchema,
) {}
