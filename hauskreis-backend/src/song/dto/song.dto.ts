import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { paginationSchema } from '../../common/http/pagination';

/**
 * Only the title is required. Lyrics themselves are never stored — just a link
 * to wherever they live (CLAUDE.md §6).
 */
export const createSongSchema = z.object({
  title: z.string().trim().min(1).max(200),
  artist: z.string().trim().min(1).max(200).nullish(),
  lyricsUrl: z.url().max(2000).nullish(),
});

export const updateSongSchema = createSongSchema.partial();

export const listSongsQuerySchema = paginationSchema.extend({
  /// Matches title *or* artist, case-insensitively — this is what the
  /// autocomplete in the "Song eintragen" field calls.
  search: z.string().trim().min(1).max(200).optional(),
});

const songParamsSchema = z.object({
  hauskreisId: z.uuid(),
  id: z.uuid(),
});

/**
 * Either point at a song already in the database, or describe a new one. That
 * mirrors the actual interaction: you type a title, and it is either something
 * the group has sung before or it is not.
 */
export const addMeetingSongSchema = z
  .object({
    songId: z.uuid().optional(),
    title: z.string().trim().min(1).max(200).optional(),
    artist: z.string().trim().min(1).max(200).nullish(),
    lyricsUrl: z.url().max(2000).nullish(),
  })
  .refine((value) => Boolean(value.songId) !== Boolean(value.title), {
    message:
      'Send either songId for a song the group already knows, or title for a new one — not both',
  });

export const updateMeetingSongSchema = z.object({
  isSelected: z.boolean(),
});

export const setSongLeadersSchema = z.object({
  /// Replaces the current list. Empty is valid — an evening may have no songs
  /// at all, and then nobody is needed.
  personIds: z.array(z.uuid()).max(9),
});

const meetingSongParamsSchema = z.object({
  hauskreisId: z.uuid(),
  meetingId: z.uuid(),
  id: z.uuid(),
});

const meetingParamsSchema = z.object({
  hauskreisId: z.uuid(),
  meetingId: z.uuid(),
});

export class CreateSongDto extends createZodDto(createSongSchema) {}
export class UpdateSongDto extends createZodDto(updateSongSchema) {}
export class ListSongsQueryDto extends createZodDto(listSongsQuerySchema) {}
export class SongParamsDto extends createZodDto(songParamsSchema) {}
export class AddMeetingSongDto extends createZodDto(addMeetingSongSchema) {}
export class UpdateMeetingSongDto extends createZodDto(
  updateMeetingSongSchema,
) {}
export class SetSongLeadersDto extends createZodDto(setSongLeadersSchema) {}
export class MeetingSongParamsDto extends createZodDto(
  meetingSongParamsSchema,
) {}
export class MeetingSongListParamsDto extends createZodDto(
  meetingParamsSchema,
) {}
