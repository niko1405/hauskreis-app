/**
 * `…/songs/lookup` — die beiden Abkürzungen beim Anlegen eines Liedes.
 *
 * `POST`, obwohl beides wie ein Abruf aussieht: Jeder Aufruf stößt beim
 * Anbieter etwas an, das Geld kostet und Sekunden dauert. Das gehört weder in
 * einen Browser-Cache noch in eine automatische Wiederholung.
 */
import { apiGet, apiPost } from '../client';
import { hkPath } from './paths';
import type { LyricsLinkCandidate, SongMetadata } from '../types';

const base = (hauskreisId: string) => hkPath(hauskreisId, '/songs/lookup');

/** `enabled: false` heißt: kein Gemini-Schlüssel im Backend hinterlegt. */
export function getSongLookupStatus(
  hauskreisId: string,
  signal?: AbortSignal,
): Promise<{ enabled: boolean }> {
  return apiGet<{ enabled: boolean }>(`${base(hauskreisId)}/status`, {
    signal,
  });
}

/** Beide Felder können `null` sein — dann stand auf der Seite nichts Klares. */
export function songMetadataFromLink(
  hauskreisId: string,
  url: string,
): Promise<SongMetadata> {
  return apiPost<SongMetadata>(`${base(hauskreisId)}/from-link`, { url });
}

/**
 * Links zum Lied, bevorzugte Seiten zuerst. Jeder wurde vor der Rückgabe
 * abgerufen; eine leere Liste heißt schlicht „nichts gefunden".
 *
 * `more: true` ist der **zweite** Druck: die bisherigen bleiben stehen, und
 * daneben sucht der Server gezielt weiter. Ohne das Feld kommt der
 * Zwischenspeicher zurück, und der kostet nichts.
 */
export function lyricsLinkSuggestions(
  hauskreisId: string,
  input: { title: string; artist?: string | null; more?: boolean },
): Promise<{ candidates: LyricsLinkCandidate[] }> {
  return apiPost<{ candidates: LyricsLinkCandidate[] }>(
    `${base(hauskreisId)}/link-suggestions`,
    input,
  );
}
