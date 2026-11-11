/**
 * Der Einladungslink — die Verwaltung auf der einen Seite, wer ihn öffnet auf
 * der anderen.
 *
 * Der Code geht immer im **Rumpf** mit, nie in der Adresse: Adressen landen in
 * Zugriffsprotokollen, und der Code ist ein Schlüssel zur Gruppe.
 */
import { apiDelete, apiGet, apiPost, apiPut, UNCONDITIONAL } from '../client';
import { hkPath } from './paths';
import type {
  InviteLinkState,
  InviteLinkValidDays,
  JoinViaLinkInput,
  Me,
  ResolvedInviteLink,
} from '../types';

/** Nur Admin. Auch ein abgelaufener Link steht hier, damit man sieht, seit wann. */
export function getInviteLink(
  hauskreisId: string,
  signal?: AbortSignal,
): Promise<InviteLinkState> {
  return apiGet<InviteLinkState>(hkPath(hauskreisId, '/invite-link'), {
    signal,
  });
}

/**
 * Ein neuer Link — ein bisheriger gilt damit nicht mehr.
 *
 * Ohne Vorbedingung: Es gibt höchstens einen, und dieser Aufruf ersetzt ihn.
 * Zwei Admins, die gleichzeitig erneuern, bekommen zwei Links, von denen der
 * spätere gilt — dafür einen Konflikt auszurufen, wäre zu viel.
 */
export async function replaceInviteLink(
  hauskreisId: string,
  validDays: InviteLinkValidDays,
): Promise<InviteLinkState> {
  const { data } = await apiPut<InviteLinkState>(
    hkPath(hauskreisId, '/invite-link'),
    { validDays },
    UNCONDITIONAL,
  );
  return data;
}

/** Abschalten. Danach führt der Link nirgends mehr hin. */
export function removeInviteLink(hauskreisId: string): Promise<void> {
  return apiDelete(hkPath(hauskreisId, '/invite-link'));
}

/**
 * Wohin ein Link führt. Geht auch **ohne Anmeldung** — wer ihn öffnet, hat oft
 * noch gar kein Konto. `404`, wenn er nicht (mehr) gilt.
 */
export function resolveInviteLink(code: string): Promise<ResolvedInviteLink> {
  return apiPost<ResolvedInviteLink>('/invite-links/resolve', { code });
}

/**
 * Beitreten. Wer noch woanders dabei ist, braucht `switchConfirmed` — sonst
 * kommt `409` mit `code: 'SWITCH_NOT_CONFIRMED'`. Als einzige Admin-Person dort
 * gehört `successorPersonId` dazu, sonst `400` wie beim Verlassen.
 */
export function joinViaLink(input: JoinViaLinkInput): Promise<Me> {
  return apiPost<Me>('/invite-links/join', input);
}
