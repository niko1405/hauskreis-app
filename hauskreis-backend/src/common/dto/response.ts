import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Gemeinsame Bausteine für die Antwort-Schemas.
 *
 * Die Schemas beschreiben nicht nur, sie **filtern**: `ZodResponse` schickt jede
 * Antwort durch das Schema, und was dort nicht steht, verlässt den Server nicht.
 * Das ist der Grund, sie überhaupt zu schreiben — eine Beschreibung, die von der
 * Wirklichkeit abweichen kann, wäre nur eine zweite Stelle zum Pflegen. Es ist
 * zugleich die Gefahr: ein vergessenes Feld fehlt ab sofort in der Antwort.
 */

/** Ein Kalendertag, `YYYY-MM-DD`. */
const isoDay = z.iso.date();

/**
 * Ein Kalendertag — **immer** `2026-08-11`, nie `2026-08-11T00:00:00.000Z`.
 *
 * Die `@db.Date`-Spalten (`meeting.date`, `absence.startDate`/`endDate`,
 * `person.birthdate`, die Gebetsbuddy-Zeiträume) haben in der Datenbank gar
 * keine Uhrzeit, aber Prisma gibt sie als volles `DateTime` zurück, und über
 * `JSON.stringify` wurde daraus ein UTC-Mitternachts-Zeitstempel. Wer den mit
 * `new Date(…)` einliest und lokal formatiert, bekommt westlich von UTC den
 * **Vortag** — ein Fehler, der nur in einem Teil der Welt auftritt und deshalb
 * spät auffällt.
 *
 * Deshalb schneidet dieses Schema den Zeitanteil ab, statt ihn nur zu
 * dokumentieren. Es nimmt beide Formen an — der eine Dienst schneidet selbst
 * zu, der andere reicht Prisma durch — und liefert immer dieselbe.
 *
 * Der `.pipe()` am Ende ist kein Zierrat: er macht das Ergebnis wieder zu einem
 * beschreibbaren Schema, sodass in OpenAPI `format: date` steht und nicht das
 * Oder aus beiden Eingabeformen.
 */
export const isoDateOut = z
  .union([isoDay, z.iso.datetime({ offset: true })])
  .transform((value) => value.slice(0, 10))
  .pipe(isoDay);

/** Zeitpunkt mit Uhrzeit, etwa `createdAt`. */
export const isoDateTimeOut = z.iso.datetime();

/**
 * Person, auf das Nötigste reduziert.
 *
 * Überall dort, wo eine Person nur *benannt* wird — als Host, als Verantwortliche
 * für ein Thema, als Gebetsbuddy. Absichtlich ohne E-Mail und Geburtsdatum: wer
 * die braucht, fragt `…/people`.
 */
export const personRefSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /// Wann das Profilbild zuletzt gesetzt wurde; `null` heißt „keins, zeig
  /// Initialen".
  ///
  /// Steht hier und nicht nur an der vollen Person, weil ein Avatar überall
  /// dort auftaucht, wo jemand *benannt* wird — als Gastgeber, als
  /// Themen-Zuständige, als Gebetsbuddy. Eine Änderung an dieser Stelle macht
  /// Bilder in allen diesen Ansichten möglich; die Alternative wäre, an einem
  /// Dutzend Stellen die Personenliste dazuzuladen, nur um an ein Bild zu
  /// kommen.
  photoUpdatedAt: isoDateTimeOut.nullable(),
});

/**
 * Das Prisma-Gegenstück zu `personRefSchema` — direkt daneben, weil die beiden
 * übereinstimmen **müssen**.
 *
 * Das Schema filtert: was hier fehlt, fehlt in der Antwort, und dann scheitert
 * die Antwort an ihrem eigenen Schema — mit 500, nicht mit einem Typfehler.
 * Zwölfmal `{ id: true, name: true }` von Hand zu tippen hieß, zwölfmal an ein
 * neues Feld denken zu müssen; einmal ist genug.
 */
export const personRefSelect = {
  id: true,
  name: true,
  photoUpdatedAt: true,
} as const;

/**
 * Eine Seite einer Liste.
 *
 * Als Funktion, weil jede Liste ihren eigenen Elementtyp hat. `total` zählt alle
 * Treffer des Filters, unabhängig von `take`/`skip`.
 */
export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    take: z.number().int().positive(),
    skip: z.number().int().nonnegative(),
    /// Ableitbar, wird aber mitgeliefert: daran verzweigen die Aufrufer, und
    /// selbst ausgerechnet ist es die Stelle, an der Off-by-one-Fehler wohnen.
    hasMore: z.boolean(),
  });
}

/**
 * Das Fehlerformat — einheitlich für alle Statuscodes, siehe
 * `AllExceptionsFilter`.
 *
 * `errors` steht nur bei `400` aus einer fehlgeschlagenen Validierung und nennt
 * dann Feld für Feld, was nicht gepasst hat.
 *
 * `code` steht nur dort, wo die App auf **genau diesen** Fall reagieren muss und
 * der Statuscode dafür nicht reicht. Bisher gibt es einen einzigen:
 * `EMAIL_NOT_VERIFIED`. Die Meldung daneben ist für Menschen und darf sich
 * jederzeit ändern; auf sie zu vergleichen wäre eine Kopplung an einen Satz.
 */
export const errorSchema = z.object({
  statusCode: z.number().int(),
  message: z.string(),
  path: z.string(),
  code: z.string().optional(),
  errors: z
    .array(z.object({ field: z.string(), message: z.string() }))
    .optional(),
});

export class ErrorDto extends createZodDto(errorSchema) {}
