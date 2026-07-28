import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createLocationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  /// Higher means "meet here more often". 0 keeps a home on the list without
  /// it ever being suggested. Ignored when `requiresHost` is false — places
  /// without a host are outside the fairness ranking.
  hostWeight: z.number().min(0).max(99).default(1),
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
