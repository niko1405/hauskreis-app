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
 * Everything is optional except the date: a meeting starts out empty and gets
 * filled in as the group decides. A meeting with no host, location or topic is
 * a valid state, not incomplete data.
 */
export const createMeetingSchema = z.object({
  date: z.iso.date(),
  type: meetingType.default(MeetingType.CUSTOM),
  locationId: z.uuid().nullish(),
  hostPersonId: z.uuid().nullish(),
  topicId: z.uuid().nullish(),
  title: z.string().trim().min(1).max(200).nullish(),
  infoText: z.string().trim().max(2000).nullish(),
});

/**
 * Ohne `status`. Absagen ist Admin-Sache und hat einen eigenen Weg
 * (`POST …/cancel`, `POST …/uncancel`) — bliebe es hier stehen, ginge die
 * Admin-Pflicht eine Tür weiter wieder auf. Dazu kommt, dass eine Absage mehr
 * schreibt als ein Feld: wann, von wem, warum.
 */
export const updateMeetingSchema = z.object({
  type: meetingType.optional(),
  locationId: z.uuid().nullish(),
  hostPersonId: z.uuid().nullish(),
  topicId: z.uuid().nullish(),
  title: z.string().trim().min(1).max(200).nullish(),
  testimonyText: z.string().trim().max(5000).nullish(),
  actionstepText: z.string().trim().max(2000).nullish(),
  summaryText: z.string().trim().max(5000).nullish(),
  infoText: z.string().trim().max(2000).nullish(),
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
