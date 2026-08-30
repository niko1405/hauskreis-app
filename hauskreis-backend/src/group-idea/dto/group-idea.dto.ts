import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createGroupIdeaSchema = z.object({
  title: z.string().min(1).max(200),
  note: z.string().max(2000).nullish(),
});

/**
 * Was sich an einer Idee ändern lässt.
 *
 * `done` ist ein Schalter und kein Zeitpunkt: Wann etwas erledigt wurde, ist
 * jetzt, und wer es war, steht im Token. Beides von außen setzen zu lassen
 * hieße, sich auf die Uhr eines Telefons zu verlassen.
 */
export const updateGroupIdeaSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  note: z.string().max(2000).nullish(),
  done: z.boolean().optional(),
});

const groupIdeaParamsSchema = z.object({
  hauskreisId: z.uuid(),
  id: z.uuid(),
});

export class CreateGroupIdeaDto extends createZodDto(createGroupIdeaSchema) {}
export class UpdateGroupIdeaDto extends createZodDto(updateGroupIdeaSchema) {}
export class GroupIdeaParamsDto extends createZodDto(groupIdeaParamsSchema) {}
