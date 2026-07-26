import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createLocationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  /// Higher means "pick this place more often" in the suggestion logic.
  frequencyFactor: z.number().positive().max(99).default(1),
  requiresHost: z.boolean().default(true),
});

export const updateLocationSchema = createLocationSchema.partial().extend({
  active: z.boolean().optional(),
});

const locationParamsSchema = z.object({
  hauskreisId: z.uuid(),
  id: z.uuid(),
});

export class CreateLocationDto extends createZodDto(createLocationSchema) {}
export class UpdateLocationDto extends createZodDto(updateLocationSchema) {}
export class LocationParamsDto extends createZodDto(locationParamsSchema) {}
