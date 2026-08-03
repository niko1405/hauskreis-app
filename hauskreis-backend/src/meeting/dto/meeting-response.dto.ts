import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  AttendanceSource,
  AttendanceStatus,
  MeetingStatus,
  MeetingType,
  TopicStatus,
} from '../../../generated/prisma/enums';
import {
  isoDateOut,
  isoDateTimeOut,
  pageSchema,
  personRefSchema,
} from '../../common/dto/response';
import { locationResponseSchema } from '../../location/dto/location-response.dto';

/**
 * Ein Abend.
 *
 * Fast alles ist optional, und das ist Absicht, nicht Nachlässigkeit: ein
 * Termin ohne Host ist ein gültiger Zustand (Treffen im Schlosspark), ein
 * Lobpreisabend hat kein Thema, und die Felder bleiben leer, bis jemand sie von
 * Hand einträgt — die App teilt niemanden zwangsweise ein.
 */
export const meetingResponseSchema = z.object({
  id: z.uuid(),
  hauskreisId: z.uuid(),
  /// Der Abend selbst — nur der Tag, `2026-08-11`, ohne Uhrzeit und ohne
  /// Zeitzone. Der Hauskreis ist dienstags, eine Uhrzeit gibt es nicht.
  date: isoDateOut,
  /// `STANDARD` hat ein Thema, `LOBPREIS_GEBET` stattdessen ein Testimony oder
  /// nur Lieder, `CUSTOM` muss gar nichts erfüllen („Geburtstag von …").
  type: z.enum(MeetingType),
  status: z.enum(MeetingStatus),
  locationId: z.uuid().nullable(),
  hostPersonId: z.uuid().nullable(),
  topicId: z.uuid().nullable(),
  /// Nur bei `CUSTOM` gefüllt.
  title: z.string().nullable(),
  /// Nur bei `LOBPREIS_GEBET` gefüllt.
  testimonyText: z.string().nullable(),
  /// Der Vorsatz für die Woche danach, samt Zusammenfassung für alle, die
  /// nicht da waren.
  actionstepText: z.string().nullable(),
  summaryText: z.string().nullable(),
  infoText: z.string().nullable(),
  createdAt: isoDateTimeOut,
  updatedAt: isoDateTimeOut,
  version: z.number().int().nonnegative(),

  /// Voll ausgelesen, inklusive Koordinaten für „In Maps öffnen".
  location: locationResponseSchema.nullable(),
  host: personRefSchema.nullable(),
  topic: z
    .object({
      id: z.uuid(),
      title: z.string().nullable(),
      status: z.enum(TopicStatus),
      responsibles: z.array(z.object({ person: personRefSchema })),
    })
    .nullable(),
  /// Wer an dem Abend für die Musik zuständig ist — leer ist gültig, nicht
  /// jeder Abend hat Lieder (CLAUDE.md §6).
  ///
  /// Steht hier **und** unter `…/meetings/:id/song-leaders`. Die eigene Route
  /// bleibt, weil dort geschrieben wird; hier steht es, damit eine Terminliste
  /// nicht pro Karte eine zweite Anfrage braucht, um „Musik: Lena" zu zeigen.
  songLeaders: z.array(z.object({ person: personRefSchema })),
  /// Wer den Actionstep für sich abgehakt hat.
  ///
  /// Namen statt einer Zahl: „5 von 9" beantwortet, wie es der Gruppe geht,
  /// „Chris, Lena, …" beantwortet, wen man fragen kann, wie es lief. Wer
  /// fehlt, hat nicht abgehakt — ein dritter Zustand ist nicht vorgesehen.
  actionstepDone: z.array(
    z.object({ person: personRefSchema, doneAt: isoDateTimeOut }),
  ),
  /// Nur wer geantwortet hat, steht hier. Keine Zeile heißt `UNKNOWN`.
  attendances: z.array(
    z.object({
      personId: z.uuid(),
      status: z.enum(AttendanceStatus),
    }),
  ),
});

/**
 * Die Antwort auf einen gesetzten oder entfernten Haken — die Zeile selbst,
 * nicht der ganze Abend.
 *
 * `doneAt` ist `null`, wenn gerade zurückgenommen wurde: es gibt dann keine
 * Zeile mehr, und ein erfundener Zeitpunkt wäre schlechter als keiner.
 */
export const actionstepDoneResponseSchema = z.object({
  meetingId: z.uuid(),
  personId: z.uuid(),
  done: z.boolean(),
  doneAt: isoDateTimeOut.nullable(),
});

/**
 * Die Antwort auf eine Teilnahme-Eintragung — die Zeile selbst, nicht der
 * ganze Abend.
 *
 * `source` unterscheidet die selbst gegebene Antwort von der aus einem
 * Abwesenheitszeitraum abgeleiteten. Ein `SELF` wird nie von einem
 * Urlaubszeitraum überschrieben: eine bewusste Antwort sticht einen pauschalen
 * Datumsbereich.
 */
export const attendanceResponseSchema = z.object({
  /// Kein eigenes `id`-Feld: der Primaerschluessel ist zusammengesetzt aus
  /// Termin und Person, eine Person kann pro Abend nur einmal antworten.
  meetingId: z.uuid(),
  personId: z.uuid(),
  status: z.enum(AttendanceStatus),
  source: z.enum(AttendanceSource),
  updatedAt: isoDateTimeOut,
});

/**
 * Was der Termin-Generator bewirkt hat.
 *
 * `skipped` sind die Daten, an denen schon ein Termin stand — der Lauf ist
 * idempotent, mehrfaches Auslösen legt nichts doppelt an.
 */
export const generationResultSchema = z.object({
  created: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});

/**
 * Was ein von Hand ausgelöster Erinnerungslauf bewirkt hat.
 *
 * `skipped` zählt alle, die aus irgendeinem Grund nichts bekamen: bereits
 * erinnert, abgeschaltet, nicht ihr Wochentag, oder Push ist gar nicht
 * konfiguriert. Der Knopf prüft den Job, er umgeht keine Einstellung.
 */
export const reminderRunResultSchema = z.object({
  notified: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});

/** Wie oben, plus der Abend, aus dem der Actionstep stammte. */
export const actionstepRunResultSchema = reminderRunResultSchema.extend({
  meetingId: z.uuid().nullable(),
});

export class MeetingResponseDto extends createZodDto(meetingResponseSchema) {}
export class MeetingPageResponseDto extends createZodDto(
  pageSchema(meetingResponseSchema),
) {}
export class AttendanceResponseDto extends createZodDto(
  attendanceResponseSchema,
) {}
export class ActionstepDoneResponseDto extends createZodDto(
  actionstepDoneResponseSchema,
) {}
export class GenerationResultResponseDto extends createZodDto(
  generationResultSchema,
) {}
export class ReminderRunResultResponseDto extends createZodDto(
  reminderRunResultSchema,
) {}
export class ActionstepRunResultResponseDto extends createZodDto(
  actionstepRunResultSchema,
) {}
