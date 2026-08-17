/** `…/people` — neun Einträge, deshalb nicht paginiert. */
import {
  apiDelete,
  apiGet,
  apiGetResource,
  apiPatch,
  apiPost,
  type Resource,
} from '../client';
import { hkPath } from './paths';
import type {
  CreatePersonInput,
  InvitedPerson,
  InvitePersonInput,
  FormerMember,
  Person,
  PersonListEntry,
  UpdatePersonInput,
} from '../types';

const base = (hauskreisId: string) => hkPath(hauskreisId, '/people');

export function listPeople(
  hauskreisId: string,
  signal?: AbortSignal,
): Promise<PersonListEntry[]> {
  return apiGet<PersonListEntry[]>(base(hauskreisId), { signal });
}

/**
 * Nur Admin. Die Ehemaligen, deren Konto gelöscht wurde — ohne Namen und
 * Adresse, dafür mit ihrer Spur im Archiv. Nur dort gebraucht, wo jemand
 * eingeladen wird, der schon einmal dabei war.
 */
export function listFormerMembers(
  hauskreisId: string,
  signal?: AbortSignal,
): Promise<FormerMember[]> {
  return apiGet<FormerMember[]>(`${base(hauskreisId)}/former`, { signal });
}

export function getPerson(
  hauskreisId: string,
  personId: string,
  options: { previous?: Resource<Person>; signal?: AbortSignal } = {},
): Promise<Resource<Person>> {
  return apiGetResource<Person>(`${base(hauskreisId)}/${personId}`, options);
}

/** Nur Admin. Legt eine Person ohne Keycloak-Konto an. */
export function createPerson(
  hauskreisId: string,
  input: CreatePersonInput,
): Promise<Person> {
  return apiPost<Person>(base(hauskreisId), input);
}

/**
 * Nur Admin. Legt Person **und** Keycloak-Konto an und verschickt die
 * Einladung. `409`, wenn es die E-Mail-Adresse in Keycloak schon gibt.
 */
export function invitePerson(
  hauskreisId: string,
  input: InvitePersonInput,
): Promise<InvitedPerson> {
  return apiPost<InvitedPerson>(`${base(hauskreisId)}/invite`, input);
}

export function updatePerson(
  hauskreisId: string,
  personId: string,
  input: UpdatePersonInput,
  etag: string | undefined,
): Promise<Resource<Person>> {
  return apiPatch<Person>(`${base(hauskreisId)}/${personId}`, input, { etag });
}

/**
 * Nur Admin. Schickt die Einladungsmail noch einmal.
 *
 * Für den Fall, dass beim Einladen der Mailserver nicht erreichbar war: das
 * Konto steht dann und die Person ist angelegt, es fehlt nur die Mail.
 */
export function resendInvitation(
  hauskreisId: string,
  personId: string,
): Promise<{ invitationEmailSent: boolean }> {
  return apiPost<{ invitationEmailSent: boolean }>(
    `${base(hauskreisId)}/${personId}/resend-invitation`,
    {},
  );
}

/** Nur Admin. */
export function deletePerson(
  hauskreisId: string,
  personId: string,
): Promise<void> {
  return apiDelete(`${base(hauskreisId)}/${personId}`);
}
