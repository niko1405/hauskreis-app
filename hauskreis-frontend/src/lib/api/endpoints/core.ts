/** `/api/me`, `/api/hauskreise`, `/api/health` — alles, was nicht hauskreisgebunden ist. */
import {
  apiDelete,
  apiGet,
  apiGetDataUrl,
  apiGetResource,
  apiPatch,
  apiPost,
  apiPostForm,
  apiPut,
  UNCONDITIONAL,
  type Resource,
} from '../client';
import { hkPath } from './paths';
import type {
  AccountDeleted,
  ChangedEmail,
  CreateHauskreisInput,
  Hauskreis,
  Invitation,
  LeaveHauskreisInput,
  LeaveResult,
  Location,
  Me,
  PhotoUploaded,
  SetHomeInput,
  VerificationSent,
} from '../types';

/**
 * Wer bin ich — Person **plus Rollen aus dem Token**. Antwortet `404`, wenn zur
 * E-Mail-Adresse keine Person existiert: dann muss ein Admin einladen.
 */
export function getMe(signal?: AbortSignal): Promise<Me> {
  return apiGet<Me>('/me', { signal });
}

/**
 * „Hier wohne ich."
 *
 * Ein Aufruf, nicht drei: der Server löst die Anschrift auf, legt die Wohnung
 * an oder zieht in die vorhandene ein und hängt die Person dran. Wohnt dort
 * schon jemand, antwortet er mit `409`, solange `joinExisting` fehlt.
 *
 * Ohne Vorbedingung: es gibt keine vorher gelesene Fassung, gegen die man
 * prüfen könnte — die Anschrift *ist* die Aussage.
 */
export async function setHome(input: SetHomeInput): Promise<Location> {
  const { data } = await apiPut<Location>('/me/home', input, UNCONDITIONAL);
  return data;
}

/** „Ich bringe keine Wohnung mit." */
export function clearHome(): Promise<void> {
  return apiDelete('/me/home');
}

/**
 * Ändert die eigene Adresse in Keycloak **und** hier — oder in keinem von
 * beiden. Das Passwort bleibt außen vor, dafür gibt es Keycloaks Konto-Seite.
 */
export async function changeEmail(email: string): Promise<ChangedEmail> {
  const { data } = await apiPatch<ChangedEmail>(
    '/me/email',
    { email },
    UNCONDITIONAL,
  );
  return data;
}

/**
 * „Schick mir die Bestätigungsmail nochmal."
 *
 * Die einzige Route, die auch mit unbestätigter Adresse antwortet — ohne sie
 * wäre der Zustand eine Sackgasse. Deshalb ist sie auch die einzige, die aus
 * dem Bildschirm dahinter überhaupt aufgerufen wird.
 */
export function resendVerification(): Promise<VerificationSent> {
  return apiPost<VerificationSent>('/me/resend-verification');
}

/** Das eigene Profilbild setzen. Zurück kommt der Zeitstempel für die URL. */
export function uploadPhoto(file: File): Promise<PhotoUploaded> {
  const form = new FormData();
  form.append('file', file);
  return apiPostForm<PhotoUploaded>('/me/photo', form);
}

/** „Doch lieber Initialen." */
export function deletePhoto(): Promise<void> {
  return apiDelete('/me/photo');
}

/**
 * Das Bild einer Person als Data-URL.
 *
 * Über den Client und nicht als `<img src>`: die API kennt nur das
 * Bearer-Token, ein direkter Verweis käme mit 401 zurück.
 */
export function getPhoto(
  hauskreisId: string,
  personId: string,
  signal?: AbortSignal,
): Promise<string> {
  return apiGetDataUrl(hkPath(hauskreisId, `/people/${personId}/photo`), {
    signal,
  });
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

/** Legt den Hauskreis an **und** macht die gründende Person dort zum Admin. */
export function createHauskreis(
  input: CreateHauskreisInput,
): Promise<Hauskreis> {
  return apiPost<Hauskreis>('/hauskreise', input);
}

/**
 * Verlässt den Hauskreis. `successorPersonId` ist nur nötig, wenn man die
 * einzige Admin-Person ist — sonst kommt ein `400`, das die Auswahl anfordert.
 */
export function leaveHauskreis(
  hauskreisId: string,
  input: LeaveHauskreisInput,
): Promise<LeaveResult> {
  return apiPost<LeaveResult>(hkPath(hauskreisId, '/leave'), input);
}

/**
 * Konto löschen: derselbe Austritt, danach Name, Adresse und Geburtstag weg
 * und das Keycloak-Konto dazu.
 *
 * Die Zeile bleibt anonym stehen — sonst verlöre jeder vergangene Abend seinen
 * Gastgeber und jede Einheit ihre Gehalten-von-Zeile. Dieselbe
 * Nachfolgeregelung wie beim Verlassen.
 */
export function deleteAccount(
  hauskreisId: string,
  input: LeaveHauskreisInput,
): Promise<AccountDeleted> {
  return apiDelete<AccountDeleted>(hkPath(hauskreisId, '/account'), input);
}

/**
 * Konto löschen, solange man zu **keinem** Hauskreis gehört.
 *
 * Ohne `hauskreisId`, anders als bei `deleteAccount`: Wer diesen Weg braucht,
 * hat keine — er steht auf dem Einstiegsbildschirm. Auch keine Nachfolge, aus
 * demselben Grund. Gehört man doch noch dazu, antwortet der Server mit `409`.
 */
export function deleteOrphanedAccount(): Promise<void> {
  return apiDelete('/me');
}

/** Offene Einladungen in andere Hauskreise — auch ohne eigene Person. */
export function listInvitations(signal?: AbortSignal): Promise<Invitation[]> {
  return apiGet<Invitation[]>('/me/invitations', { signal });
}

/** Annehmen heißt: den bisherigen Hauskreis im selben Zug verlassen. */
export function acceptInvitation(
  personId: string,
  input: LeaveHauskreisInput,
): Promise<Me> {
  return apiPost<Me>(`/me/invitations/${personId}/accept`, input);
}
