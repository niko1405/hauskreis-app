/** `…/songs` — die Song-Datenbank, die mit jedem Vorschlag mitwächst. */
import {
  apiDelete,
  apiGet,
  apiGetResource,
  apiPatch,
  apiPost,
  type Resource,
} from '../client';
import { hkPath } from './paths';
import type { SongListParams } from '../params';
import type {
  CreateSongInput,
  Page,
  ReminderRunResult,
  Song,
  SongListItem,
  UpdateSongInput,
} from '../types';

const base = (hauskreisId: string) => hkPath(hauskreisId, '/songs');

/** Die Listenform trägt zusätzlich `timesPlayed` und `lastPlayedAt`. */
export function listSongs(
  hauskreisId: string,
  params: SongListParams = {},
  signal?: AbortSignal,
): Promise<Page<SongListItem>> {
  return apiGet<Page<SongListItem>>(base(hauskreisId), {
    query: { ...params },
    signal,
  });
}

export function getSong(
  hauskreisId: string,
  songId: string,
  options: { previous?: Resource<Song>; signal?: AbortSignal } = {},
): Promise<Resource<Song>> {
  return apiGetResource<Song>(`${base(hauskreisId)}/${songId}`, options);
}

/** Lyrics werden nicht gespeichert, nur die URL zu einer externen Quelle. */
export function createSong(
  hauskreisId: string,
  input: CreateSongInput,
): Promise<Song> {
  return apiPost<Song>(base(hauskreisId), input);
}

export function updateSong(
  hauskreisId: string,
  songId: string,
  input: UpdateSongInput,
  etag: string | undefined,
): Promise<Resource<Song>> {
  return apiPatch<Song>(`${base(hauskreisId)}/${songId}`, input, { etag });
}

/** Nur Admin. */
export function deleteSong(hauskreisId: string, songId: string): Promise<void> {
  return apiDelete(`${base(hauskreisId)}/${songId}`);
}

/** Nur Admin. Erinnert die Musik-Verantwortlichen an die Songauswahl. */
export function runSongReminders(
  hauskreisId: string,
): Promise<ReminderRunResult> {
  return apiPost<ReminderRunResult>(`${base(hauskreisId)}/reminders`);
}
