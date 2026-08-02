/** Die zusammengesetzten Ansichten: Home-Screen, Einteilungen, Archiv-Kennzahlen. */
import { apiGet } from '../client';
import { hkPath } from './paths';
import type { AssignmentParams } from '../params';
import type { ArchiveSummary, Assignment, HomeScreen } from '../types';

/**
 * Der ganze Startbildschirm in einem Aufruf: nächster Termin samt Ort,
 * eigene Rollen der nächsten acht Wochen, offener Actionstep, aktuelle
 * Gebetsbuddys. Bewusst **nicht** in vier Einzelabfragen zerlegen.
 */
export function getHome(
  hauskreisId: string,
  signal?: AbortSignal,
): Promise<HomeScreen> {
  return apiGet<HomeScreen>(hkPath(hauskreisId, '/home'), { signal });
}

/**
 * Ohne `personId` die Mehrwochen-Tabelle, mit `personId` die Badges einer
 * Person. Eine Route für beides, damit die zwei Ansichten nicht
 * unterschiedlicher Meinung sein können, wer dran ist.
 */
export function getAssignments(
  hauskreisId: string,
  params: AssignmentParams,
  signal?: AbortSignal,
): Promise<{ items: Assignment[] }> {
  return apiGet<{ items: Assignment[] }>(hkPath(hauskreisId, '/assignments'), {
    query: { ...params },
    signal,
  });
}

export function getArchiveSummary(
  hauskreisId: string,
  signal?: AbortSignal,
): Promise<ArchiveSummary> {
  return apiGet<ArchiveSummary>(hkPath(hauskreisId, '/archive'), { signal });
}
