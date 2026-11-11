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

/**
 * Wie lange ein neuer Einladungslink gilt — in Tagen.
 *
 * Drei Stufen statt einer freien Zahl: „bis morgen", „eine Woche" und „einen
 * Monat" sind die Fragen, die sich jemand stellt, der einen Link in eine
 * WhatsApp-Gruppe stellt. Ein Link ohne Ablauf gibt es bewusst nicht — er läge
 * für immer in einem Chatverlauf und öffnete eine Gruppe, in der Gebetsanliegen
 * stehen.
 */
export const INVITE_LINK_VALID_DAYS = [1, 7, 30] as const;

export const replaceInviteLinkSchema = z.object({
  validDays: z.literal(INVITE_LINK_VALID_DAYS),
});

/**
 * Der Code aus dem Link. Im Rumpf und nicht im Pfad: Pfade landen in jedem
 * Zugriffsprotokoll, und der Code ist ein Schlüssel zur Gruppe.
 */
const inviteCodeSchema = z
  .string()
  .min(16)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

export const resolveInviteLinkSchema = z.object({ code: inviteCodeSchema });

/**
 * Beitreten über den Link.
 *
 * `switchConfirmed` ist die Rückfrage, und sie steht **hier**, nicht nur im
 * Frontend: Wer noch in einem anderen Hauskreis ist, verlässt ihn mit diesem
 * Schritt — und das soll kein Aufrufer auslösen können, der vergessen hat zu
 * fragen. Ohne die Bestätigung antwortet der Server mit `409`.
 *
 * `successorPersonId` gilt dem **alten** Hauskreis, wie beim Verlassen.
 */
export const joinViaLinkSchema = z.object({
  code: inviteCodeSchema,
  switchConfirmed: z.boolean().optional(),
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
export class ReplaceInviteLinkDto extends createZodDto(
  replaceInviteLinkSchema,
) {}
export class ResolveInviteLinkDto extends createZodDto(
  resolveInviteLinkSchema,
) {}
export class JoinViaLinkDto extends createZodDto(joinViaLinkSchema) {}
