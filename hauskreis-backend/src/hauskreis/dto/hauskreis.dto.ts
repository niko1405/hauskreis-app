import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createHauskreisSchema = z.object({
  name: z.string().min(1).max(100),
});

const hauskreisParamsSchema = z.object({
  hauskreisId: z.uuid(),
});

export class CreateHauskreisDto extends createZodDto(createHauskreisSchema) {}
export class HauskreisParamsDto extends createZodDto(hauskreisParamsSchema) {}
