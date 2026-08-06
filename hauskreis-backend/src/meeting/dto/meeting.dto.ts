import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { AttendanceStatus, MeetingType } from '../../../generated/prisma/enums';
import { paginationSchema } from '../../common/http/pagination';
import { isoDay } from '../../common/dto/iso-day';

// Deriving the schemas from Prisma's generated enums keeps the API and the
// database in sync — adding a value in schema.prisma is enough.
const meetingType = z.enum(MeetingType);
const attendanceStatus = z.enum(AttendanceStatus);

/**
 * Woraus der Abend besteht — drei Schalter, überall optional.
 *
 * Weggelassen heißt beim Anlegen „nimm die Voreinstellung der Terminart" und
 * beim Ändern „lass es, wie es ist". Deshalb hier **kein** `.default()`: das
 * würde die Felder auch im PATCH zu Pflichtangaben machen (Zod-Vorgaben
 * überleben `.partial()`, siehe `types.ts` im Frontend), und dann müsste jeder,
 * der nur den Titel ändert, drei Schalter mitschicken.
 *
 * Einen Gastgeber-Schalter gibt es nicht: man trifft sich immer irgendwo.
 */
const slotFields = {
  hasTopicSlot: z.boolean().optional(),
  hasSongSlot: z.boolean().optional(),
  hasTestimonySlot: z.boolean().optional(),
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
  type: meetingType.default(MeetingType.CUSTOM),
  locationId: z.uuid().nullish(),
  hostPersonId: z.uuid().nullish(),
  topicId: z.uuid().nullish(),
  /// Wie `hostPersonId` eine Rolle, die man schon beim Anlegen vergeben darf.
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
  locationId: z.uuid().nullish(),
  hostPersonId: z.uuid().nullish(),
  topicId: z.uuid().nullish(),
  title: z.string().trim().min(1).max(200).nullish(),
  /// Wer sein Testimony erzählt. Nur bei `hasTestimonySlot`.
  testimonyPersonId: z.uuid().nullish(),
  actionstepText: z.string().trim().max(2000).nullish(),
  summaryText: z.string().trim().max(5000).nullish(),
  infoText: z.string().trim().max(2000).nullish(),
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
export class ListMeetingsQueryDto extends createZodDto(
  listMeetingsQuerySchema,
) {}
export class MeetingParamsDto extends createZodDto(meetingParamsSchema) {}
