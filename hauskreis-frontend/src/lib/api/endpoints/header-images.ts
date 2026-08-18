/**
 * `…/header-images` — das Hintergrundbild im Kopfbereich eines Bildschirms.
 *
 * Ein Bild gilt für die ganze Gruppe, und jede:r darf es tauschen. Zwei Wege
 * zum selben Bild, wie bei den Profilbildern: die **Liste** der Zeitstempel
 * (daraus baut die App ihren Cache-Schlüssel) und die **Datei** einzeln.
 */
import { apiDelete, apiGet, apiGetDataUrl, apiPostForm } from '../client';
import { hkPath } from './paths';
import type { HeaderImage, HeaderScreen } from '../types';

const base = (hauskreisId: string, suffix = '') =>
  hkPath(hauskreisId, `/header-images${suffix}`);

/**
 * Für welche der vier Bildschirme überhaupt ein Bild gesetzt ist.
 *
 * Ein Aufruf für alle vier: die App braucht ohnehin jeden Zeitstempel, sobald
 * sie den ersten Bildschirm zeigt. Wer hier fehlt, bekommt den Verlauf.
 */
export function listHeaderImages(
  hauskreisId: string,
  signal?: AbortSignal,
): Promise<HeaderImage[]> {
  return apiGet<HeaderImage[]>(base(hauskreisId), { signal });
}

/**
 * Das Bild als Data-URL.
 *
 * Über den Client und nicht als `<img src>`: die API kennt nur das
 * Bearer-Token, ein direkter Verweis käme mit 401 zurück.
 *
 * **`?v=` ist kein Schmuck, sondern der ganze Grund, warum ein neues Bild
 * ankommt.** Die Antwort trägt `Cache-Control: private, max-age=3600`; ohne
 * einen Wechsel in der Adresse beantwortet der Browser die nächste Anfrage
 * eine Stunde lang aus seinem eigenen Speicher — ohne zu fragen, ohne ETag,
 * ohne dass die App etwas davon merkt. Genau so kam nach dem Hochladen das
 * alte Bild zurück, und zwei Geräte zeigten verschiedene: Jedes hatte seinen
 * eigenen veralteten Stand.
 *
 * Der Schlüssel der Abfrage allein reichte nicht. Er sorgt dafür, dass die App
 * neu **anfragt** — was auf die Anfrage antwortet, entscheidet er nicht.
 */
export function getHeaderImage(
  hauskreisId: string,
  screen: HeaderScreen,
  updatedAt: string,
  signal?: AbortSignal,
): Promise<string> {
  return apiGetDataUrl(base(hauskreisId, `/${screen}`), {
    query: { v: updatedAt },
    signal,
  });
}

/** Ein neues Bild setzen. Zurück kommt der Zeitstempel für die URL. */
export function uploadHeaderImage(
  hauskreisId: string,
  screen: HeaderScreen,
  file: File,
): Promise<HeaderImage> {
  const form = new FormData();
  form.append('file', file);
  return apiPostForm<HeaderImage>(base(hauskreisId, `/${screen}`), form);
}

/** „Doch lieber wieder der Verlauf." */
export function deleteHeaderImage(
  hauskreisId: string,
  screen: HeaderScreen,
): Promise<void> {
  return apiDelete(base(hauskreisId, `/${screen}`));
}
