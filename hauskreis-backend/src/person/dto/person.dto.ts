import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createPersonSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.email(),
  birthdate: z.iso.date().optional(),
  playsInstrument: z.boolean().default(false),
  canHost: z.boolean().default(true),
  /// The home this person brings into the hosting rotation, if any.
  locationId: z.uuid().nullish(),
});

export const updatePersonSchema = createPersonSchema.partial().extend({
  active: z.boolean().optional(),
});

const personParamsSchema = z.object({
  hauskreisId: z.uuid(),
  id: z.uuid(),
});

export const invitePersonSchema = createPersonSchema.extend({
  role: z.enum(['member', 'admin']).default('member'),
});

/**
 * „Hier wohne ich." Kein `locationId`, sondern eine Anschrift: welche Wohnung
 * das ist, entscheidet der Server über den normalisierten Schlüssel — und nur
 * so kann er merken, dass dort schon jemand wohnt.
 */
export const setHomeSchema = z.object({
  address: z.string().trim().min(1).max(200),
  /// Wie viele Platz haben. Gehört der Wohnung, nicht der Person: in einer
  /// Wohngemeinschaft sehen und ändern alle Bewohner:innen dieselbe Zahl.
  /// `null` heißt „alle passen rein".
  capacity: z.number().int().positive().max(200).nullish(),
  /// Bestätigung, dass man wirklich zu den Leuten zieht, die dort schon
  /// wohnen. Ohne sie lehnt der Server mit `409` ab — ein Tippfehler sieht
  /// aus wie eine Wohngemeinschaft.
  joinExisting: z.boolean().default(false),
});

export const changeEmailSchema = z.object({
  email: z.email(),
});

export class CreatePersonDto extends createZodDto(createPersonSchema) {}
export class SetHomeDto extends createZodDto(setHomeSchema) {}
export class ChangeEmailDto extends createZodDto(changeEmailSchema) {}
export class InvitePersonDto extends createZodDto(invitePersonSchema) {}
export class UpdatePersonDto extends createZodDto(updatePersonSchema) {}
export class PersonParamsDto extends createZodDto(personParamsSchema) {}
