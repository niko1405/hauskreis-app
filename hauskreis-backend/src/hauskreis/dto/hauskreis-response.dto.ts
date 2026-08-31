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
  /// Wer ihr seid, in ein paar Sätzen. `null`, solange es niemand geschrieben
  /// hat — ein Hauskreis, der sich nicht beschreibt, ist immer noch einer.
  description: z.string().nullable(),
  /**
   * Was diese Gruppe benutzt.
   *
   * Steht am Hauskreis und nicht hinter einem eigenen Endpunkt, weil es genau
   * dort gebraucht wird, wo ohnehin schon der Name steht: in der Navigation
   * (der Gebets-Tab) und auf dem Startbildschirm. Eine zweite Abfrage dafür
   * wäre ein zweiter Ladezustand für ein Ja/Nein.
   *
   * Abgeleitet aus den beiden Konfigurationstabellen, nicht hier gespeichert —
   * `hauskreis` trägt Identität, keine Einstellungen.
   */
  features: z.object({
    prayerBuddies: z.boolean(),
    weeklyActionstep: z.boolean(),
  }),
  /// Wann das Gruppenbild zuletzt gesetzt wurde; `null` heißt „keins".
  ///
  /// Derselbe Kniff wie bei `person.photoUpdatedAt`: Der Zeitstempel hängt als
  /// Query-Parameter an der Bild-URL, damit ein neues Bild nicht hinter dem
  /// Zwischenspeicher des Browsers verschwindet.
  photoUpdatedAt: isoDateTimeOut.nullable(),
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
 * Nach dem Löschen des Kontos.
 *
 * Ohne `successorPersonId`: wer sein Konto löscht, sieht danach nichts mehr von
 * dieser Gruppe — wem die Verwaltung zufällt, ist die Nachricht an die anderen,
 * nicht an ihn.
 */
export const accountDeletedSchema = z.object({
  /// Wahr, wenn die letzte Person gegangen ist und der Hauskreis mitging.
  hauskreisDeleted: z.boolean(),
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
export class AccountDeletedResponseDto extends createZodDto(
  accountDeletedSchema,
) {}
export class InvitationListResponseDto extends createZodDto(
  z.array(invitationResponseSchema),
) {}
export class HauskreisListResponseDto extends createZodDto(
  z.array(hauskreisResponseSchema),
) {}
