/**
 * `…/absences` — Abwesenheiten. Der Server sagt daraufhin automatisch für
 * betroffene Termine ab (`POST …/absences/sync`, Admin).
 */
import {
  apiDelete,
  apiGet,
  apiGetResource,
  apiPatch,
  apiPost,
  type Resource,
} from '../client';
import { hkPath } from './paths';
import type { AbsenceListParams } from '../params';
import type {
  Absence,
  CreateAbsenceInput,
  Page,
  SyncResult,
  UpdateAbsenceInput,
} from '../types';

const base = (hauskreisId: string) => hkPath(hauskreisId, '/absences');

export function listAbsences(
  hauskreisId: string,
  params: AbsenceListParams = {},
  signal?: AbortSignal,
): Promise<Page<Absence>> {
  return apiGet<Page<Absence>>(base(hauskreisId), {
    query: { ...params },
    signal,
  });
}

export function getAbsence(
  hauskreisId: string,
  absenceId: string,
  options: { previous?: Resource<Absence>; signal?: AbortSignal } = {},
): Promise<Resource<Absence>> {
  return apiGetResource<Absence>(`${base(hauskreisId)}/${absenceId}`, options);
}

/** Ohne `personId` gilt der Eintrag für einen selbst. Tage als `YYYY-MM-DD`. */
export function createAbsence(
  hauskreisId: string,
  input: CreateAbsenceInput,
): Promise<Absence> {
  return apiPost<Absence>(base(hauskreisId), input);
}

export function updateAbsence(
  hauskreisId: string,
  absenceId: string,
  input: UpdateAbsenceInput,
  etag: string | undefined,
): Promise<Resource<Absence>> {
  return apiPatch<Absence>(`${base(hauskreisId)}/${absenceId}`, input, {
    etag,
  });
}

export function deleteAbsence(
  hauskreisId: string,
  absenceId: string,
): Promise<void> {
  return apiDelete(`${base(hauskreisId)}/${absenceId}`);
}

/** Nur Admin. Gleicht bestehende Zusagen mit den Abwesenheiten ab. */
export function syncAbsences(hauskreisId: string): Promise<SyncResult> {
  return apiPost<SyncResult>(`${base(hauskreisId)}/sync`);
}
