/** Lieder und Musik-Verantwortliche eines Termins. */
import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  UNCONDITIONAL,
} from '../client';
import { hkPath } from './paths';
import type {
  AddMeetingSongInput,
  MeetingSong,
  PersonRef,
  RoleSuggestion,
  SetSongLeadersInput,
} from '../types';

const base = (hauskreisId: string, meetingId: string) =>
  hkPath(hauskreisId, `/meetings/${meetingId}`);

export function listMeetingSongs(
  hauskreisId: string,
  meetingId: string,
  signal?: AbortSignal,
): Promise<MeetingSong[]> {
  return apiGet<MeetingSong[]>(`${base(hauskreisId, meetingId)}/songs`, {
    signal,
  });
}

/**
 * Entweder `songId` aus der Song-Datenbank **oder** `title` (+ optional
 * `artist`, `lyricsUrl`) für ein Lied, das es noch nicht gibt — dann wird es
 * gleich mit angelegt.
 */
export function addMeetingSong(
  hauskreisId: string,
  meetingId: string,
  input: AddMeetingSongInput,
): Promise<MeetingSong> {
  return apiPost<MeetingSong>(`${base(hauskreisId, meetingId)}/songs`, input);
}

/** Ohne Vorbedingung — die Route deklariert weder `412` noch `428`. */
export function setMeetingSongSelected(
  hauskreisId: string,
  meetingId: string,
  meetingSongId: string,
  isSelected: boolean,
): Promise<MeetingSong> {
  return apiPatch<MeetingSong>(
    `${base(hauskreisId, meetingId)}/songs/${meetingSongId}`,
    { isSelected },
    UNCONDITIONAL,
  ).then((r) => r.data);
}

export function removeMeetingSong(
  hauskreisId: string,
  meetingId: string,
  meetingSongId: string,
): Promise<void> {
  return apiDelete(`${base(hauskreisId, meetingId)}/songs/${meetingSongId}`);
}

export function getSongLeaders(
  hauskreisId: string,
  meetingId: string,
  signal?: AbortSignal,
): Promise<PersonRef[]> {
  return apiGet<PersonRef[]>(`${base(hauskreisId, meetingId)}/song-leaders`, {
    signal,
  });
}

/** Setzt die komplette Liste; ohne Vorbedingung. */
export function setSongLeaders(
  hauskreisId: string,
  meetingId: string,
  input: SetSongLeadersInput,
): Promise<PersonRef[]> {
  return apiPut<PersonRef[]>(
    `${base(hauskreisId, meetingId)}/song-leaders`,
    input,
    UNCONDITIONAL,
  ).then((r) => r.data);
}

/** Berücksichtigt, wer überhaupt ein Instrument spielt. */
export function getSongLeaderSuggestions(
  hauskreisId: string,
  meetingId: string,
  signal?: AbortSignal,
): Promise<RoleSuggestion[]> {
  return apiGet<RoleSuggestion[]>(
    `${base(hauskreisId, meetingId)}/song-leader-suggestions`,
    { signal },
  );
}
