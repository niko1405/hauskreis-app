import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PersonRole } from '../../../generated/prisma/enums';
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
  /// Der **Anzeigename** — was auf Karten und in „Du bist dran" steht.
  name: z.string(),
  /// Der Name, mit dem man sich anmeldet. `null`, solange sich die Person noch
  /// nie angemeldet hat: gewählt wird er beim Aktivieren des Kontos.
  username: z.string().nullable(),
  email: z.email(),
  /// Nur der Tag, ohne Uhrzeit — ein Geburtstag hat keine.
  birthdate: isoDateOut.nullable(),
  playsInstrument: z.boolean(),
  canHost: z.boolean(),
  /// „Ich bin grundsätzlich dabei." Kommende Abende werden im Voraus zugesagt,
  /// solange nichts anderes dasteht.
  autoAttend: z.boolean(),
  /// Was diese Person **in diesem Hauskreis** darf. Vorher war „Admin" eine
  /// Realm-Rolle und galt überall; wer sich einen eigenen Hauskreis anlegt,
  /// ist dort Admin und im alten Mitglied.
  role: z.enum(PersonRole),
  /// Das Zuhause, das diese Person in die Host-Rotation einbringt. `null` heißt
  /// „bringt keines ein" — alle anderen Rollen bleiben davon unberührt.
  locationId: z.uuid().nullable(),
  active: z.boolean(),
  /// Wann sich die Person zum ersten Mal angemeldet hat. `null` heißt
  /// „eingeladen, aber noch nicht da" — der Zustand, in dem sich eine
  /// Einladung noch zurückziehen lässt.
  acceptedAt: isoDateTimeOut.nullable(),
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
/**
 * `GET /api/me`. Ohne die Realm-Rollen aus dem Token: „Admin" steht jetzt als
 * `role` an der Person und gilt nur für ihren Hauskreis.
 */
export const meResponseSchema = personResponseSchema;

/**
 * `PATCH /api/me/email` — die geänderte Person plus die Frage, ob Keycloak
 * die Bestätigungsmail losgeworden ist.
 *
 * **Bis die neue Adresse bestätigt ist, kommt niemand herein.** Hier stand
 * einmal das Gegenteil („die Anmeldung funktioniert weiter"), und es stimmte
 * für Keycloak auch: angemeldet wird man weiterhin. Nur weist `AuthGuard`
 * jedes Token mit unbestätigter Adresse ab, und ein Adresswechsel setzt genau
 * die Bestätigung zurück. Die App zeigt deshalb ab da einen eigenen
 * Bildschirm — deswegen ist `verificationEmailSent` keine Nebensache: ist es
 * `false`, sitzt jemand fest, bis die Mail nachkommt.
 */
export const changedEmailResponseSchema = personResponseSchema.extend({
  verificationEmailSent: z.boolean(),
});

/** Was `POST /api/me/resend-verification` mitteilt. */
export const verificationSentResponseSchema = z.object({
  verificationEmailSent: z.boolean(),
});

/**
 * Eine Person in der Mitgliederliste — mit dem, was nur die Liste weiß.
 *
 * `awayToday` ist abgeleitet und steht deshalb nur hier: eine einzelne Person
 * abzurufen beantwortet die Frage „wer ist gerade weg" nicht, und ein Feld, das
 * je nach Route etwas anderes bedeutet, wäre schlimmer als zwei Schemas.
 */
export const personListEntrySchema = personResponseSchema.extend({
  /// Ob ein Abwesenheitszeitraum den heutigen Tag abdeckt.
  awayToday: z.boolean(),
});

/** Was `POST …/people/:id/resend-invitation` mitteilt. */
export const resendInvitationResponseSchema = z.object({
  /// Falsch, wenn Keycloak die Mail nicht losgeworden ist — dann klemmt der
  /// Mailserver, nicht die Einladung.
  invitationEmailSent: z.boolean(),
});

export class PersonResponseDto extends createZodDto(personResponseSchema) {}
export class ResendInvitationResponseDto extends createZodDto(
  resendInvitationResponseSchema,
) {}
export class PersonListResponseDto extends createZodDto(
  z.array(personListEntrySchema),
) {}
export class InvitedPersonResponseDto extends createZodDto(
  invitedPersonResponseSchema,
) {}
export class MeResponseDto extends createZodDto(meResponseSchema) {}
export class ChangedEmailResponseDto extends createZodDto(
  changedEmailResponseSchema,
) {}
export class VerificationSentResponseDto extends createZodDto(
  verificationSentResponseSchema,
) {}
