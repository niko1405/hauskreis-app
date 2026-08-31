import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createHauskreisSchema = z.object({
  name: z.string().min(1).max(100),
});

/**
 * Wer ihr seid — Name und Beschreibung.
 *
 * Kein Admin-Recht davor, wie beim Kopfbild: Bei neun Leuten ist die
 * Selbstbeschreibung keine Verwaltungsangelegenheit. Was hier drinsteht, sehen
 * ohnehin nur die neun.
 *
 * Beide Felder optional, aber verschieden gemeint: Ein fehlendes `name` heißt
 * „unverändert", ein `description: null` heißt „weg damit". Deshalb `nullish`
 * beim einen und `optional` beim anderen — einen Hauskreis ohne Namen gibt es
 * nicht.
 */
export const updateHauskreisSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(2000).nullish(),
});

/**
 * Wer als einzige Admin-Person geht, benennt eine Nachfolge. Sonst bliebe eine
 * Gruppe zurück, in der niemand mehr einladen darf.
 *
 * Optional, weil es meistens niemanden braucht: wer kein Admin ist oder noch
 * andere Admins zurücklässt, geht ohne Weiteres. Fehlt es, wo es nötig wäre,
 * ist das ein `400`, das die Auswahl anfordert.
 */
export const leaveHauskreisSchema = z.object({
  successorPersonId: z.uuid().optional(),
});

const hauskreisParamsSchema = z.object({
  hauskreisId: z.uuid(),
});

const invitationParamsSchema = z.object({
  personId: z.uuid(),
});

export class CreateHauskreisDto extends createZodDto(createHauskreisSchema) {}
export class UpdateHauskreisDto extends createZodDto(updateHauskreisSchema) {}
export class LeaveHauskreisDto extends createZodDto(leaveHauskreisSchema) {}
export class HauskreisParamsDto extends createZodDto(hauskreisParamsSchema) {}
export class InvitationParamsDto extends createZodDto(invitationParamsSchema) {}
