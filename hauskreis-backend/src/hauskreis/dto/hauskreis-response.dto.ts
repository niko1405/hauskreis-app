import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { isoDateTimeOut } from '../../common/dto/response';
import { PersonRole } from '../../../generated/prisma/enums';

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

/** Was aus dem Verlassen geworden ist — beides ist ein gültiger Ausgang. */
export const leaveResultSchema = z.object({
  /// Wahr, wenn die letzte Person gegangen ist. Eine leere Gruppe, die niemand
  /// betreten kann, ist kein sinnvoller Zustand.
  hauskreisDeleted: z.boolean(),
  /// Wer die Admin-Rechte übernommen hat, falls es jemanden brauchte.
  successorPersonId: z.uuid().nullable(),
});

/**
 * Eine offene Einladung: eine Person-Zeile mit der eigenen Adresse, die noch
 * niemandem gehört. Sie nimmt der bestehenden Mitgliedschaft nichts weg, bis
 * man sie annimmt.
 */
export const invitationResponseSchema = z.object({
  /// Die Id der eingeladenen Zeile — damit wird sie angenommen.
  personId: z.uuid(),
  role: z.enum(PersonRole),
  invitedAt: isoDateTimeOut,
  hauskreis: z.object({ id: z.uuid(), name: z.string() }),
});

export class HauskreisResponseDto extends createZodDto(
  hauskreisResponseSchema,
) {}
export class LeaveResultResponseDto extends createZodDto(leaveResultSchema) {}
export class InvitationListResponseDto extends createZodDto(
  z.array(invitationResponseSchema),
) {}
export class HauskreisListResponseDto extends createZodDto(
  z.array(hauskreisResponseSchema),
) {}
