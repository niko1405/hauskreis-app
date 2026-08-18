/**
 * `…/birthdays` — wer wann Geburtstag hat, und wer das Geschenk besorgt.
 *
 * **Keine Personen-Id in irgendeinem Pfad.** Wer fragt, weiß der Server aus dem
 * Token, und daran hängt die Regel, die dieses Modul trägt: Wer Geburtstag hat,
 * bekommt zu seiner eigenen Runde nichts geschickt — keine Vorschläge, keinen
 * Preis, kein „schon entschieden". Ausgeblendet wird also nicht hier, sondern
 * dort; hier kommt schlicht nichts an, was zu verbergen wäre.
 */
import {
  apiDelete,
  apiGet,
  apiGetResource,
  apiPost,
  apiPut,
  UNCONDITIONAL,
  type Resource,
} from '../client';
import { hkPath } from './paths';
import type {
  BirthdayDetail,
  BirthdayGiftConfig,
  BirthdayOverview,
  CreateGiftIdeaInput,
  DecideGiftInput,
  GiftIdea,
  GiftPairings,
  UpdateBirthdayGiftConfigInput,
  UpdateGiftPairingsInput,
} from '../types';

const base = (hauskreisId: string) => hkPath(hauskreisId, '/birthdays');

export function getBirthdayOverview(
  hauskreisId: string,
  signal?: AbortSignal,
): Promise<BirthdayOverview> {
  return apiGet<BirthdayOverview>(base(hauskreisId), { signal });
}

export function getBirthday(
  hauskreisId: string,
  occasionId: string,
  signal?: AbortSignal,
): Promise<BirthdayDetail> {
  return apiGet<BirthdayDetail>(`${base(hauskreisId)}/${occasionId}`, {
    signal,
  });
}

/** Auswählen und den Preis eintragen — beides darf nur der Zuständige. */
export function decideGift(
  hauskreisId: string,
  occasionId: string,
  input: DecideGiftInput,
): Promise<BirthdayDetail> {
  return apiPut<BirthdayDetail>(
    `${base(hauskreisId)}/${occasionId}/gift`,
    input,
    UNCONDITIONAL,
  ).then((response) => response.data);
}

export function proposeGiftIdea(
  hauskreisId: string,
  occasionId: string,
  input: CreateGiftIdeaInput,
): Promise<GiftIdea[]> {
  return apiPost<GiftIdea[]>(`${base(hauskreisId)}/${occasionId}/ideas`, input);
}

export function removeGiftIdea(
  hauskreisId: string,
  occasionId: string,
  ideaId: string,
): Promise<GiftIdea[]> {
  return apiDelete<GiftIdea[]>(
    `${base(hauskreisId)}/${occasionId}/ideas/${ideaId}`,
  );
}

/** Zustimmen oder die Zustimmung zurücknehmen. */
export function voteGiftIdea(
  hauskreisId: string,
  occasionId: string,
  ideaId: string,
  approve: boolean,
): Promise<GiftIdea[]> {
  const path = `${base(hauskreisId)}/${occasionId}/ideas/${ideaId}/vote`;

  return approve
    ? apiPut<GiftIdea[]>(path, {}, UNCONDITIONAL).then(
        (response) => response.data,
      )
    : apiDelete<GiftIdea[]>(path);
}

/**
 * Die Einstellungen — mit ETag, weil zwei Admins sie gleichzeitig ändern
 * könnten und die letzte Antwort sonst gewönne, ohne es zu merken.
 */
export function getBirthdayConfig(
  hauskreisId: string,
  signal?: AbortSignal,
): Promise<Resource<BirthdayGiftConfig>> {
  return apiGetResource<BirthdayGiftConfig>(`${base(hauskreisId)}/config`, {
    signal,
  });
}

export function updateBirthdayConfig(
  hauskreisId: string,
  input: UpdateBirthdayGiftConfigInput,
  etag: string | undefined,
): Promise<Resource<BirthdayGiftConfig>> {
  return apiPut<BirthdayGiftConfig>(`${base(hauskreisId)}/config`, input, {
    etag,
  });
}

export function getGiftPairings(
  hauskreisId: string,
  signal?: AbortSignal,
): Promise<GiftPairings> {
  return apiGet<GiftPairings>(`${base(hauskreisId)}/pairings`, { signal });
}

export function setGiftPairings(
  hauskreisId: string,
  input: UpdateGiftPairingsInput,
): Promise<GiftPairings> {
  return apiPut<GiftPairings>(
    `${base(hauskreisId)}/pairings`,
    input,
    UNCONDITIONAL,
  ).then((response) => response.data);
}
