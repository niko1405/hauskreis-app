import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { AttendanceStatus, MeetingType } from '../../../generated/prisma/enums';
import { paginationSchema } from '../../common/http/pagination';
import { isoDay } from '../../common/dto/iso-day';
import { wallClockIn } from '../../common/dto/wall-clock';

// Deriving the schemas from Prisma's generated enums keeps the API and the
// database in sync — adding a value in schema.prisma is enough.
const meetingType = z.enum(MeetingType);
const attendanceStatus = z.enum(AttendanceStatus);

/**
 * Woraus der Abend besteht — vier Schalter, überall optional.
 *
 * Weggelassen heißt beim Anlegen „nimm die Voreinstellung der Terminart" und
 * beim Ändern „lass es, wie es ist". Deshalb hier **kein** `.default()`: das
 * würde die Felder auch im PATCH zu Pflichtangaben machen (Zod-Vorgaben
 * überleben `.partial()`, siehe `types.ts` im Frontend), und dann müsste jeder,
 * der nur den Titel ändert, vier Schalter mitschicken.
 *
 * Einen Gastgeber-Schalter gibt es nicht: man trifft sich immer irgendwo.
 */
const slotFields = {
  hasTopicSlot: z.boolean().optional(),
  hasSongSlot: z.boolean().optional(),
  hasTestimonySlot: z.boolean().optional(),
  /// Zusammenfassung und Actionstep ohne Thema. Schließt `hasTopicSlot` aus.
  hasNotesSlot: z.boolean().optional(),
};

/**
 * Everything is optional except the date: a meeting starts out empty and gets
 * filled in as the group decides. A meeting with no host, location or topic is
 * a valid state, not incomplete data.
 */
export const createMeetingSchema = z.object({
  date: z.iso.date(),
  /// Letzter Tag eines mehrtägigen Termins. Nur bei `CUSTOM` erlaubt und muss
  /// hinter `date` liegen — beides prüft der Service, weil beides den Blick auf
  /// ein zweites Feld braucht.
  endDate: z.iso.date().nullish(),
  /// Wann es losgeht, `"19:30"`. Weggelassen heißt „die Zeit der Gruppe" — die
  /// steht in `MeetingScheduleConfig`, und sie in jeden Aufrufer zu kopieren
  /// wäre eine zweite Stelle, an der sie veralten kann. Nicht `nullish`: ein
  /// Abend ohne Uhrzeit ist kein Zustand, den es geben soll.
  startTime: wallClockIn.optional(),
  type: meetingType.default(MeetingType.CUSTOM),
  locationId: z.uuid().nullish(),
  hostPersonId: z.uuid().nullish(),
  /// Wie `hostPersonId` eine Rolle, die man schon beim Anlegen vergeben darf.
  /// Das Thema fehlt hier bewusst: es wird über `…/topic-responsibles`
  /// zugeteilt und danach *gewählt* — zwei Schritte, die an den Termin zu
  /// hängen hieße, sie wieder zu einem zu machen.
  testimonyPersonId: z.uuid().nullish(),
  title: z.string().trim().min(1).max(200).nullish(),
  infoText: z.string().trim().max(2000).nullish(),
  ...slotFields,
});

/**
 * Ohne `status`. Absagen ist Admin-Sache und hat einen eigenen Weg
 * (`POST …/cancel`, `POST …/uncancel`) — bliebe es hier stehen, ginge die
 * Admin-Pflicht eine Tür weiter wieder auf. Dazu kommt, dass eine Absage mehr
 * schreibt als ein Feld: wann, von wem, warum.
 */
export const updateMeetingSchema = z.object({
  type: meetingType.optional(),
  endDate: z.iso.date().nullish(),
  /// Änderbar, aber nicht leerbar — genau das heißt „Pflichtfeld" in einem
  /// PATCH. Ändert sie sich am nächsten Abend, erfahren es die anderen
  /// (`MEETING_TIME_CHANGED`).
  startTime: wallClockIn.optional(),
  locationId: z.uuid().nullish(),
  hostPersonId: z.uuid().nullish(),
  title: z.string().trim().min(1).max(200).nullish(),
  /// Wer sein Testimony erzählt. Nur bei `hasTestimonySlot`.
  testimonyPersonId: z.uuid().nullish(),
  infoText: z.string().trim().max(2000).nullish(),
  /// Die Nachbereitung des Abends — nur bei `hasNotesSlot`, sonst weist
  /// `assertSlotsAllow` sie ab. Hat der Abend ein **Thema**, stehen beide an
  /// dessen Einheit (`PATCH …/topic-sessions/:id`): dort gehören sie zu dem,
  /// was besprochen wurde, und überleben einen Rollenwechsel.
  ///
  /// Dieselben Grenzen wie dort — es ist derselbe Text, nur an einem anderen
  /// Träger.
  summaryText: z.string().trim().min(1).max(5000).nullish(),
  actionstepText: z.string().trim().min(1).max(2000).nullish(),
  ...slotFields,
});

export const setAttendanceSchema = z.object({
  personId: z.uuid(),
  status: attendanceStatus,
});

/**
 * Warum der Abend ausfällt.
 *
 * Optional, weil es Absagen ohne Erklärung gibt und ein Pflichtfeld dann nur
 * mit „—" gefüllt würde. Steht etwas da, steht es auf der Terminseite groß
 * daneben — das ist der eigentliche Zweck.
 */
export const cancelMeetingSchema = z.object({
  reason: z.string().trim().min(1).max(500).nullish(),
});

/**
 * Der Haken am eigenen Actionstep.
 *
 * Ohne `personId`, anders als bei der Teilnahme: einen Vorsatz hakt man für
 * sich ab, nicht füreinander. Wer gemeint ist, steht im Token.
 */
export const setActionstepDoneSchema = z.object({
  done: z.boolean(),
});

/**
 * Wann sich die Gruppe regelmäßig trifft.
 *
 * Alle drei zusammen und nicht einzeln änderbar: es ist **ein** Satz — „wir
 * treffen uns dienstags um 18 Uhr, und zwar deutscher Zeit". Drei Felder mit je
 * eigenem Speichern-Knopf machten daraus drei Entscheidungen, von denen man die
 * letzte vergisst.
 */
export const updateMeetingScheduleSchema = z.object({
  /// 0 = Sonntag … 6 = Samstag, dieselbe Zählung wie `Date.getUTCDay()`.
  weekday: z.coerce.number().int().min(0).max(6),
  /// Die Uhrzeit neuer Abende, `"18:00"`. Ändert keinen bestehenden Termin.
  startTime: wallClockIn,
  /// Die Zone, in der diese Uhrzeit gilt — und in der „heute" gezählt wird.
  ///
  /// Geprüft gegen die Liste, die Node ohnehin mitbringt: eine handgepflegte
  /// veraltete, und ein freies Textfeld ließe `Europe/Kölln` durch, woran
  /// später jede Datumsrechnung stumm scheiterte.
  timeZone: z
    .string()
    .refine((zone) => Intl.supportedValuesOf('timeZone').includes(zone), {
      message: 'Diese Zeitzone kenne ich nicht',
    }),
});

export const listMeetingsQuerySchema = paginationSchema.extend({
  /// 'upcoming' (default) hides past meetings; 'past' powers the archive view.
  scope: z.enum(['upcoming', 'past', 'all']).default('upcoming'),
  /// Free text over everything an evening was written down as: title,
  /// summary, actionstep, info, testimony and the topic's title. That is the
  /// archive question — "wann ging es nochmal um Vergebung" — and nobody
  /// remembers which of those fields it was in.
  search: z.string().trim().min(1).max(200).optional(),
  /// Inclusive date bounds, for narrowing the archive to a year or a stretch.
  from: isoDay.optional(),
  to: isoDay.optional(),
  /// Ob abgesagte Abende mitkommen. Vorgabe `true` — die Terminliste zeigt sie
  /// seit jeher, und ein abgesagter Abend ist dort eine Auskunft und kein
  /// Rauschen. Das Archiv-Register schaltet sie ab: wer nachliest, was war,
  /// sucht Abende, an denen etwas war.
  ///
  /// Als Text und nicht als `z.boolean()`, weil Query-Parameter Text sind —
  /// gleiche Bauform wie `playedOnly` bei den Liedern.
  includeCancelled: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});

const meetingParamsSchema = z.object({
  hauskreisId: z.uuid(),
  id: z.uuid(),
});

export class CreateMeetingDto extends createZodDto(createMeetingSchema) {}
export class UpdateMeetingDto extends createZodDto(updateMeetingSchema) {}
export class CancelMeetingDto extends createZodDto(cancelMeetingSchema) {}
export class SetAttendanceDto extends createZodDto(setAttendanceSchema) {}
export class SetActionstepDoneDto extends createZodDto(
  setActionstepDoneSchema,
) {}
export class UpdateMeetingScheduleDto extends createZodDto(
  updateMeetingScheduleSchema,
) {}
export class ListMeetingsQueryDto extends createZodDto(
  listMeetingsQuerySchema,
) {}
export class MeetingParamsDto extends createZodDto(meetingParamsSchema) {}
