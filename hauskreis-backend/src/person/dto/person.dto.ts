import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createPersonSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.email(),
  birthdate: z.iso.date().optional(),
  playsInstrument: z.boolean().default(false),
  canHost: z.boolean().default(true),
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

export class CreatePersonDto extends createZodDto(createPersonSchema) {}
export class InvitePersonDto extends createZodDto(invitePersonSchema) {}
export class UpdatePersonDto extends createZodDto(updatePersonSchema) {}
export class PersonParamsDto extends createZodDto(personParamsSchema) {}
