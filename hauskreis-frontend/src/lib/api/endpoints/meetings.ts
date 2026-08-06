/** `…/meetings` samt Vorschlägen, Anwesenheit und den Admin-Läufen. */
import {
  apiDelete,
  apiGet,
  apiGetResource,
  apiPatch,
  apiPost,
  apiPostWithPrecondition,
  apiPut,
  UNCONDITIONAL,
  type Resource,
} from '../client';
import { hkPath } from './paths';
import type { MeetingListParams } from '../params';
import type {
  ActionstepDone,
  ActionstepRunResult,
  Attendance,
  CreateMeetingInput,
  GenerationResult,
  HostSuggestion,
  Meeting,
  MeetingPage,
  ReminderRunResult,
  RoleSuggestion,
  CancelMeetingInput,
  SetAttendanceInput,
  UpdateMeetingInput,
} from '../types';

const base = (hauskreisId: string) => hkPath(hauskreisId, '/meetings');

export function listMeetings(
  hauskreisId: string,
  params: MeetingListParams = {},
  signal?: AbortSignal,
): Promise<MeetingPage> {
  return apiGet<MeetingPage>(base(hauskreisId), {
    query: { ...params },
    signal,
  });
}

export function getMeeting(
  hauskreisId: string,
  meetingId: string,
  options: { previous?: Resource<Meeting>; signal?: AbortSignal } = {},
): Promise<Resource<Meeting>> {
  return apiGetResource<Meeting>(`${base(hauskreisId)}/${meetingId}`, options);
}

export function createMeeting(
  hauskreisId: string,
  input: CreateMeetingInput,
): Promise<Meeting> {
  return apiPost<Meeting>(base(hauskreisId), input);
}

export function updateMeeting(
  hauskreisId: string,
  meetingId: string,
  input: UpdateMeetingInput,
  etag: string | undefined,
): Promise<Resource<Meeting>> {
  return apiPatch<Meeting>(`${base(hauskreisId)}/${meetingId}`, input, {
    etag,
  });
}

/** Nur Admin. */
export function deleteMeeting(
  hauskreisId: string,
  meetingId: string,
): Promise<void> {
  return apiDelete(`${base(hauskreisId)}/${meetingId}`);
}

/** Sagt den ganzen Abend ab. Nur Admin; der Grund ist freiwillig. */
export function cancelMeeting(
  hauskreisId: string,
  meetingId: string,
  input: CancelMeetingInput,
  etag: string | undefined,
): Promise<Resource<Meeting>> {
  return apiPostWithPrecondition<Meeting>(
    `${base(hauskreisId)}/${meetingId}/cancel`,
    { etag },
    input,
  );
}

/** Nimmt die Absage zurück — auch eine, die von selbst zustande kam. */
export function uncancelMeeting(
  hauskreisId: string,
  meetingId: string,
  etag: string | undefined,
): Promise<Resource<Meeting>> {
  return apiPostWithPrecondition<Meeting>(
    `${base(hauskreisId)}/${meetingId}/uncancel`,
    { etag },
  );
}

/** Ohne Vorbedingung — die Route deklariert weder `412` noch `428`. */
export function setAttendance(
  hauskreisId: string,
  meetingId: string,
  input: SetAttendanceInput,
): Promise<Attendance> {
  return apiPut<Attendance>(
    `${base(hauskreisId)}/${meetingId}/attendance`,
    input,
    UNCONDITIONAL,
  ).then((r) => r.data);
}

/**
 * Hakt den Actionstep für **einen selbst** ab. Ohne Vorbedingung und ohne
 * `personId`: einen Vorsatz hakt man für sich ab, wer gemeint ist, steht im
 * Token.
 */
export function setActionstepDone(
  hauskreisId: string,
  meetingId: string,
  done: boolean,
): Promise<ActionstepDone> {
  return apiPut<ActionstepDone>(
    `${base(hauskreisId)}/${meetingId}/actionstep-done`,
    { done },
    UNCONDITIONAL,
  ).then((r) => r.data);
}

/**
 * Sortierte Liste **mit den Fakten dahinter** — wann jemand zuletzt dran war,
 * wie oft, was noch ansteht, dazu Abwesenheit und die Kennzahlen des Ortes.
 * Wer nur die Reihenfolge übernimmt, gibt den Sinn des Endpunkts auf (§8).
 */
export function getHostSuggestions(
  hauskreisId: string,
  meetingId: string,
  signal?: AbortSignal,
): Promise<HostSuggestion[]> {
  return apiGet<HostSuggestion[]>(
    `${base(hauskreisId)}/${meetingId}/host-suggestions`,
    { signal },
  );
}

export function getTopicSuggestions(
  hauskreisId: string,
  meetingId: string,
  signal?: AbortSignal,
): Promise<RoleSuggestion[]> {
  return apiGet<RoleSuggestion[]>(
    `${base(hauskreisId)}/${meetingId}/topic-suggestions`,
    { signal },
  );
}

/**
 * Wer als Nächstes sein Testimony erzählen könnte.
 *
 * Dieselbe Rangfolge wie beim Thema und ohne Eignungsfilter — eine Geschichte
 * hat jede:r.
 */
export function getTestimonySuggestions(
  hauskreisId: string,
  meetingId: string,
  signal?: AbortSignal,
): Promise<RoleSuggestion[]> {
  return apiGet<RoleSuggestion[]>(
    `${base(hauskreisId)}/${meetingId}/testimony-suggestions`,
    { signal },
  );
}

// ── Admin-Läufe ─────────────────────────────────────────────────────────────

/** Legt Standard-Termine im Voraus an, sodass immer mind. 7 zuteilbar sind. */
export function generateMeetings(
  hauskreisId: string,
): Promise<GenerationResult> {
  return apiPost<GenerationResult>(`${base(hauskreisId)}/generate`);
}

export function runHostReminders(
  hauskreisId: string,
): Promise<ReminderRunResult> {
  return apiPost<ReminderRunResult>(`${base(hauskreisId)}/host-reminders`);
}

/** An alle, nicht nur an Zuständige — ein besonderer Termin betrifft die Gruppe. */
export function runCustomMeetingReminders(
  hauskreisId: string,
): Promise<ReminderRunResult> {
  return apiPost<ReminderRunResult>(
    `${base(hauskreisId)}/custom-meeting-reminders`,
  );
}

export function runActionstepReminders(
  hauskreisId: string,
): Promise<ActionstepRunResult> {
  return apiPost<ActionstepRunResult>(
    `${base(hauskreisId)}/actionstep-reminders`,
  );
}
