/** `/api/me`, `/api/hauskreise`, `/api/health` — alles, was nicht hauskreisgebunden ist. */
import { apiGet, apiGetResource, apiPost, type Resource } from '../client';
import { hkPath } from './paths';
import type { CreateHauskreisInput, Hauskreis, Me } from '../types';

/**
 * Wer bin ich — Person **plus Rollen aus dem Token**. Antwortet `404`, wenn zur
 * E-Mail-Adresse keine Person existiert: dann muss ein Admin einladen.
 */
export function getMe(signal?: AbortSignal): Promise<Me> {
  return apiGet<Me>('/me', { signal });
}

/** Nicht paginiert. Liefert die `hauskreisId` für alles Weitere. */
export function listHauskreise(signal?: AbortSignal): Promise<Hauskreis[]> {
  return apiGet<Hauskreis[]>('/hauskreise', { signal });
}

export function getHauskreis(
  hauskreisId: string,
  options: { previous?: Resource<Hauskreis>; signal?: AbortSignal } = {},
): Promise<Resource<Hauskreis>> {
  return apiGetResource<Hauskreis>(hkPath(hauskreisId), options);
}

export function createHauskreis(
  input: CreateHauskreisInput,
): Promise<Hauskreis> {
  return apiPost<Hauskreis>('/hauskreise', input);
}
