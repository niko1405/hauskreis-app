import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createHauskreisSchema = z.object({
  name: z.string().min(1).max(100),
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
export class LeaveHauskreisDto extends createZodDto(leaveHauskreisSchema) {}
export class HauskreisParamsDto extends createZodDto(hauskreisParamsSchema) {}
export class InvitationParamsDto extends createZodDto(invitationParamsSchema) {}
