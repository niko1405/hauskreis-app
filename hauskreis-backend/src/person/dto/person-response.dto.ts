import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { isoDateOut, isoDateTimeOut } from '../../common/dto/response';

/**
 * Eine Person, wie sie die Gruppe sieht.
 *
 * `keycloakUserId` fehlt mit Absicht: das ist die interne Verknüpfung zum
 * Identity-Provider, für keinen Client von Nutzen und nichts, was man
 * herumreicht. Weil dieses Schema die Antwort *beschneidet*, gilt das ab jetzt
 * für jede Route, die es benutzt — auch für die, die vorher am `personSelect`
 * vorbei die ganze Zeile zurückgaben.
 *
 * `email` bleibt drin: wer Mitglieder verwaltet, braucht sie, und in einer
 * Gruppe von neun kennt sie ohnehin jeder.
 */
export const personResponseSchema = z.object({
  id: z.uuid(),
  hauskreisId: z.uuid(),
  name: z.string(),
  email: z.email(),
  /// Nur der Tag, ohne Uhrzeit — ein Geburtstag hat keine.
  birthdate: isoDateOut.nullable(),
  playsInstrument: z.boolean(),
  canHost: z.boolean(),
  /// Das Zuhause, das diese Person in die Host-Rotation einbringt. `null` heißt
  /// „bringt keines ein" — alle anderen Rollen bleiben davon unberührt.
  locationId: z.uuid().nullable(),
  active: z.boolean(),
  createdAt: isoDateTimeOut,
  /// Zähler für das Optimistic Locking. Landet als ETag im Header; von dort
  /// nimmt man ihn, nicht von hier.
  version: z.number().int().nonnegative(),
});

/** Was `POST …/people/invite` zusätzlich mitteilt. */
export const invitedPersonResponseSchema = personResponseSchema.extend({
  /// Falsch, wenn Keycloak kein SMTP kennt — dann existiert das Konto, aber
  /// niemand wurde benachrichtigt. In der lokalen Entwicklung der Normalfall.
  invitationEmailSent: z.boolean(),
});

/**
 * `GET /api/me` — die eigene Person plus die Rollen aus dem Token.
 *
 * Die Rollen stehen im Token und nicht in der Datenbank; sie kommen hier mit,
 * damit das Frontend nicht selbst das JWT auseinandernehmen muss, um zu wissen,
 * ob es Admin-Bedienelemente zeigen darf.
 */
export const meResponseSchema = personResponseSchema.extend({
  roles: z.array(z.string()),
});

export class PersonResponseDto extends createZodDto(personResponseSchema) {}
export class PersonListResponseDto extends createZodDto(
  z.array(personResponseSchema),
) {}
export class InvitedPersonResponseDto extends createZodDto(
  invitedPersonResponseSchema,
) {}
export class MeResponseDto extends createZodDto(meResponseSchema) {}
