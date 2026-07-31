import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { isoDateTimeOut } from '../../common/dto/response';

/**
 * Der Hauskreis selbst — die Wurzel, unter der alles andere hängt.
 *
 * Die Datenstruktur ist von Anfang an mandantenfähig, auch wenn es vorerst nur
 * einen gibt. Jede andere Route trägt die `hauskreisId` im Pfad; von hier holt
 * sich ein Client sie beim Start.
 */
export const hauskreisResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  createdAt: isoDateTimeOut,
  version: z.number().int().nonnegative(),
});

export class HauskreisResponseDto extends createZodDto(
  hauskreisResponseSchema,
) {}
export class HauskreisListResponseDto extends createZodDto(
  z.array(hauskreisResponseSchema),
) {}
