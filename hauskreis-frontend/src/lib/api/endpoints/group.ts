/**
 * Der Hauskreis als Gruppe — Bild, Beschreibung, Ideen.
 *
 * Getrennt von `core.ts`, wo `getHauskreis` und `createHauskreis` stehen: Dort
 * geht es um „welcher Hauskreis bin ich", hier um „wer sind wir". Das ist der
 * Bildschirm hinter der Pille im Kopf.
 */
import {
  apiDelete,
  apiGet,
  apiGetDataUrl,
  apiPatch,
  apiPost,
  apiPostForm,
  type Precondition,
  type Resource,
} from '../client';
import { hkPath } from './paths';
import type {
  CreateGroupIdeaInput,
  GroupIdea,
  Hauskreis,
  PhotoUploaded,
  UpdateGroupIdeaInput,
  UpdateHauskreisInput,
} from '../types';

/** Name und Beschreibung. Mit `If-Match`, die Zeile trägt eine `version`. */
export function updateHauskreis(
  hauskreisId: string,
  input: UpdateHauskreisInput,
  precondition: Precondition,
): Promise<Resource<Hauskreis>> {
  return apiPatch<Hauskreis>(hkPath(hauskreisId), input, precondition);
}

/**
 * Das Gruppenbild als Data-URL.
 *
 * `?v=` aus demselben Grund wie beim Kopfbild: Die Antwort trägt
 * `Cache-Control: private, max-age=3600`, und ohne einen Wechsel in der
 * Adresse liefert der Browser eine Stunde lang das alte Bild aus seinem
 * eigenen Speicher — ohne zu fragen und ohne dass die App es merkt.
 */
export function getGroupPhoto(
  hauskreisId: string,
  updatedAt: string,
  signal?: AbortSignal,
): Promise<string> {
  return apiGetDataUrl(hkPath(hauskreisId, '/photo'), {
    query: { v: updatedAt },
    signal,
  });
}

export function uploadGroupPhoto(
  hauskreisId: string,
  file: File,
): Promise<PhotoUploaded> {
  const form = new FormData();
  form.append('file', file);
  return apiPostForm<PhotoUploaded>(hkPath(hauskreisId, '/photo'), form);
}

export function deleteGroupPhoto(hauskreisId: string): Promise<void> {
  return apiDelete(hkPath(hauskreisId, '/photo'));
}

// ── Ideen ───────────────────────────────────────────────────────────────────

const ideas = (hauskreisId: string, suffix = '') =>
  hkPath(hauskreisId, `/ideas${suffix}`);

/** Offene zuerst, erledigte darunter — die Sortierung kommt vom Server. */
export function listIdeas(
  hauskreisId: string,
  signal?: AbortSignal,
): Promise<GroupIdea[]> {
  return apiGet<GroupIdea[]>(ideas(hauskreisId), { signal });
}

export function createIdea(
  hauskreisId: string,
  input: CreateGroupIdeaInput,
): Promise<GroupIdea> {
  return apiPost<GroupIdea>(ideas(hauskreisId), input);
}

export function updateIdea(
  hauskreisId: string,
  id: string,
  input: UpdateGroupIdeaInput,
  precondition: Precondition,
): Promise<Resource<GroupIdea>> {
  return apiPatch<GroupIdea>(ideas(hauskreisId, `/${id}`), input, precondition);
}

/** Nur die eigene — oder als Admin. Sonst antwortet der Server mit `403`. */
export function deleteIdea(hauskreisId: string, id: string): Promise<void> {
  return apiDelete(ideas(hauskreisId, `/${id}`));
}
