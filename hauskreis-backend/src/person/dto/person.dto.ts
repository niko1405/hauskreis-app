import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PersonRole } from '../../../generated/prisma/enums';

export const createPersonSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.email(),
  birthdate: z.iso.date().optional(),
  playsInstrument: z.boolean().default(false),
  canHost: z.boolean().default(true),
  /// „Ich bin grundsätzlich dabei." Sagt kommende Abende im Voraus zu.
  autoAttend: z.boolean().default(false),
  /// The home this person brings into the hosting rotation, if any.
  locationId: z.uuid().nullish(),
});

/**
 * Wie ein Nutzername aussehen darf.
 *
 * Kleingeschrieben beim Schreiben, weil Keycloak ohnehin normalisiert — und
 * zwei Wahrheiten über denselben Namen sind genau das Problem, das dieses Feld
 * schließt. Punkt, Strich und Unterstrich sind erlaubt, sonst nichts: ein
 * Leerzeichen im Anmeldenamen ist eine Fehlerquelle ohne Gegenwert.
 */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9._-]{3,30}$/,
    'Nutzernamen bestehen aus 3–30 Zeichen: Buchstaben, Ziffern, Punkt, Strich oder Unterstrich',
  );

export const updatePersonSchema = createPersonSchema.partial().extend({
  active: z.boolean().optional(),
  /// Wandert bei Änderung nach Keycloak zurück, damit die Anmeldung mit dem
  /// neuen Namen funktioniert.
  username: usernameSchema.optional(),
  /// Nur mit `@HauskreisAdmin()` — der Controller weist es sonst ab.
  role: z.enum(PersonRole).optional(),
});

const personParamsSchema = z.object({
  hauskreisId: z.uuid(),
  id: z.uuid(),
});

/**
 * Eine Einladung ist eine Adresse und eine Rolle — mehr nicht.
 *
 * **Auch kein Name.** Bis eben tippte der Admin einen ein, und der stand
 * danach als Anzeigename in der App — auch dann, wenn die Person sich beim
 * Aktivieren ihres Kontos ganz anders genannt hat. Zwei Leute benannten
 * denselben Menschen, und der Betroffene gewann nicht. Der Anzeigename entsteht
 * jetzt beim ersten Anmelden aus dem selbst gewählten Nutzernamen; bis dahin
 * steht der lokale Teil der Adresse da, damit die Zeile überhaupt etwas anzeigt.
 *
 * Ob jemand ein Instrument spielt, ob er gerade hosten möchte und wo er wohnt,
 * weiß ohnehin nur er selbst; das steht im Profil und nicht im
 * Einladungsformular.
 */
export const invitePersonSchema = z.object({
  email: z.email(),
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
