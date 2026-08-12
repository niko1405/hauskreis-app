import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  AttendanceSource,
  AttendanceStatus,
  MeetingCancelSource,
  MeetingStatus,
  MeetingType,
} from '../../../generated/prisma/enums';
import {
  isoDateOut,
  isoDateTimeOut,
  pageSchema,
  personRefSchema,
} from '../../common/dto/response';
import { wallClockOut } from '../../common/dto/wall-clock';
import { locationResponseSchema } from '../../location/dto/location-response.dto';
import { topicSessionInMeetingSchema } from '../../topic/dto/topic-response.dto';

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
  /// Der Tag, `2026-08-11` — ohne Uhrzeit und ohne Zeitzone. Wann es losgeht,
  /// steht daneben in `startTime`; getrennt, weil der Tag eine Kalenderangabe
  /// ist und die Uhrzeit eine Wanduhr, und beides zusammen einen Zeitpunkt
  /// ergäbe, der über Zeitzonen hinweg wandert.
  date: isoDateOut,
  /// Wann ihr euch trefft, `"19:30"`, Ortszeit. Jeder Abend hat eine; erzeugte
  /// bekommen die der Gruppe (`…/meetings/config`).
  startTime: wallClockOut,
  /// Letzter Tag, wenn sich der Termin über mehrere zieht (eine Freizeit von
  /// Freitag bis Sonntag). `null` heißt: ein Tag, der Normalfall.
  endDate: isoDateOut.nullable(),
  /// Die Art des Abends — fürs Auge. **Was** dazugehört, sagen die drei Slots
  /// darunter; der Typ ist nur noch ihre Voreinstellung beim Anlegen.
  type: z.enum(MeetingType),
  status: z.enum(MeetingStatus),
  /// Woraus der Abend besteht. Ein abgeschalteter Baustein heißt: das Feld
  /// dazu lässt sich nicht schreiben, die Rolle wird nicht vorgeschlagen, es
  /// gibt keine Erinnerung dafür, und der Abend zählt in der Fairness-Rechnung
  /// dieser Rolle nicht mit.
  ///
  /// Thema und Testimony sind nie beide an, Thema und Nachbereitung auch nicht.
  /// Einen Gastgeber-Schalter gibt es nicht — man trifft sich immer irgendwo.
  hasTopicSlot: z.boolean(),
  hasSongSlot: z.boolean(),
  hasTestimonySlot: z.boolean(),
  hasNotesSlot: z.boolean(),
  locationId: z.uuid().nullable(),
  hostPersonId: z.uuid().nullable(),
  /// Wie der Abend überschrieben ist. Gilt für jede Terminart; bleibt er leer,
  /// steht dort der Titel des Themas und sonst die Art des Termins.
  title: z.string().nullable(),
  /// Wer sein Testimony erzählt. Nur bei `hasTestimonySlot`.
  testimonyPersonId: z.uuid().nullable(),
  /// Was **vor** dem Abend zu wissen ist. Ohne Baustein, immer da.
  infoText: z.string().nullable(),
  /// Die Nachbereitung des Abends — nur bei `hasNotesSlot` gefüllt.
  ///
  /// Anders als beim Thema **nicht** zurückgehalten: an der Nachbereitung hängt
  /// keine Rolle, sie entsteht während oder nach dem Abend, und es gibt
  /// niemanden, dem man sie vorher vorenthalten würde. Wer den Actionstep
  /// abhaken darf, entscheidet dagegen die Uhr — siehe `POST …/actionstep-done`.
  summaryText: z.string().nullable(),
  actionstepText: z.string().nullable(),
  createdAt: isoDateTimeOut,
  updatedAt: isoDateTimeOut,
  version: z.number().int().nonnegative(),

  /// Alles drei nur bei `status = CANCELLED` gefüllt. Ein abgesagter Abend,
  /// an dem nur „abgesagt" steht, wirft genau die Fragen auf, die er
  /// beantworten sollte.
  cancelledAt: isoDateTimeOut.nullable(),
  /// `MANUAL` heißt: ein Admin hat abgesagt, und nur ein Admin nimmt das
  /// zurück. `ALL_DECLINED` heißt: es hatten alle abgesagt — sagt wieder
  /// jemand zu, lebt der Abend von selbst auf.
  cancelSource: z.enum(MeetingCancelSource).nullable(),
  cancelReason: z.string().nullable(),
  cancelledBy: personRefSchema.nullable(),

  /// Voll ausgelesen, inklusive Koordinaten für „In Maps öffnen".
  location: locationResponseSchema.nullable(),
  host: personRefSchema.nullable(),
  testimonyPerson: personRefSchema.nullable(),
  /// Wer an diesem Abend das Thema vorbereitet — die **Zuteilung**, unabhängig
  /// davon, ob schon etwas gewählt ist. Genau dieser Zwischenzustand fehlte
  /// vorher: eine Zuteilung legte sofort ein leeres Thema an, und der Abend sah
  /// aus, als stünde schon etwas fest.
  topicResponsibles: z.array(z.object({ person: personRefSchema })),
  /// Die gewählte Einheit samt Nachbereitung. `null` heißt „noch nichts
  /// gewählt"; ihre Textfelder sind `null`, solange `contentVisible` falsch ist.
  topicSession: topicSessionInMeetingSchema.nullable(),
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
 * Wann sich die Gruppe regelmäßig trifft.
 *
 * Die Vorgabe für **neue** Abende, keine nachträgliche Regel: was schon im
 * Kalender steht, behält seinen Tag und seine Zeit. Sonst verrückte eine
 * Einstellung Termine, für die längst jemand zugesagt hat.
 */
export const meetingScheduleSchema = z.object({
  id: z.uuid(),
  hauskreisId: z.uuid(),
  /// 0 = Sonntag … 6 = Samstag.
  weekday: z.number().int().min(0).max(6),
  /// `"18:00"` — dieselbe Schreibweise wie `meeting.startTime`.
  startTime: wallClockOut,
  /// Die Zone, in der diese Uhrzeit gilt — `"Europe/Berlin"`.
  ///
  /// Steht hier, obwohl sie kaum jemand liest: die App rechnet ihre Tage damit
  /// (`setGroupZone` im Frontend), sonst zeigte ein Gerät in einer anderen Zone
  /// „Vorbei" an einem Abend, den der Server noch als kommend führt.
  timeZone: z.string(),
  updatedByPersonId: z.uuid().nullable(),
  updatedAt: isoDateTimeOut,
  version: z.number().int().nonnegative(),
  updatedBy: personRefSchema.nullable(),
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
export class MeetingScheduleResponseDto extends createZodDto(
  meetingScheduleSchema,
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
