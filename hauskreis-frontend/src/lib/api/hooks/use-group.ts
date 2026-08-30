'use client';

/**
 * Die Gruppe als Gegenstand: Bild, Beschreibung, Ideen.
 *
 * Zu unterscheiden von `useHauskreis()` aus dem Kontext — der beantwortet „in
 * welchem Hauskreis bin ich" und liefert den Namen für Kopf und Pille. Hier
 * geht es um den Bildschirm dahinter, und dafür braucht es die Fassungsnummer
 * zum Schreiben.
 */
import { useQuery } from '@tanstack/react-query';
import { STALE } from '../cache';
import { coreApi, groupApi } from '../endpoints';
import { etagOfVersion } from '../client';
import { qk } from '../query-keys';
import type {
  CreateGroupIdeaInput,
  GroupIdea,
  Hauskreis,
  UpdateGroupIdeaInput,
  UpdateHauskreisInput,
} from '../types';
import { useHk } from './use-hk';
import { useApiMutation, useResource, useResourceUpdate } from './use-resource';

/** Der Hauskreis samt ETag — die Grundlage für „Name ändern". */
export function useHauskreisDetail() {
  const { hauskreisId, enabled } = useHk();

  return useResource<Hauskreis>(
    qk.hauskreisDetail(hauskreisId),
    ({ previous, signal }) =>
      coreApi.getHauskreis(hauskreisId, { previous, signal }),
    // `reference` und nicht `detail`: Ein Gruppenname ändert sich so oft wie
    // ein Hauskreis heißt. Die Abfrage hängt an der Kopfleiste und damit an
    // jedem Tab — 30 Sekunden Frische wären dort Nachfragen ohne Anlass.
    { enabled, staleTime: STALE.reference },
  );
}

/**
 * Name und Beschreibung schreiben.
 *
 * `qk.hauskreise` fällt mit: Aus der Liste zieht der Kontext-Provider den
 * Namen, und der steht in der Kopfleiste über jedem Bildschirm. Ohne die
 * Invalidierung stünde dort nach dem Umbenennen weiter der alte.
 */
export function useUpdateHauskreis() {
  const { hauskreisId } = useHk();

  return useResourceUpdate({
    queryKey: qk.hauskreisDetail(hauskreisId),
    update: (input: UpdateHauskreisInput, etag) =>
      groupApi.updateHauskreis(hauskreisId, input, { etag }),
    invalidateKeys: [qk.hauskreise],
  });
}

/**
 * Das Gruppenbild.
 *
 * Zeile für Zeile wie `useHeaderImage`: Der Zeitstempel steht im Schlüssel
 * **und** in der Adresse. Das eine sorgt dafür, dass die App neu anfragt, das
 * andere dafür, dass der Browser nicht aus seinem eigenen Speicher antwortet.
 *
 * Kein Bild ist der Regelfall und kein Fehler — dann stehen die Initialen da.
 */
export function useGroupPhoto() {
  const { hauskreisId, keys } = useHk();
  const detail = useHauskreisDetail();
  const updatedAt = detail.data?.data.photoUpdatedAt ?? undefined;

  const file = useQuery({
    queryKey: keys.group.photo(updatedAt ?? ''),
    queryFn: ({ signal }) =>
      groupApi.getGroupPhoto(hauskreisId, updatedAt!, signal),
    enabled: Boolean(hauskreisId) && updatedAt !== undefined,
    // Unter demselben Schlüssel **kann** sich nichts mehr ändern.
    staleTime: Infinity,
    retry: false,
  });

  return { dataUrl: file.data, exists: updatedAt !== undefined };
}

export function useUploadGroupPhoto() {
  const { hauskreisId } = useHk();

  return useApiMutation(
    (file: File) => groupApi.uploadGroupPhoto(hauskreisId, file),
    { invalidateKeys: [qk.hauskreisDetail(hauskreisId), qk.hauskreise] },
  );
}

export function useDeleteGroupPhoto() {
  const { hauskreisId } = useHk();

  return useApiMutation(() => groupApi.deleteGroupPhoto(hauskreisId), {
    invalidateKeys: [qk.hauskreisDetail(hauskreisId), qk.hauskreise],
  });
}

// ── Ideen ───────────────────────────────────────────────────────────────────

/** Offene zuerst, erledigte darunter — die Reihenfolge kommt vom Server. */
export function useIdeas() {
  const { hauskreisId, enabled, keys } = useHk();

  return useQuery({
    queryKey: keys.group.ideas,
    queryFn: ({ signal }) => groupApi.listIdeas(hauskreisId, signal),
    enabled,
    staleTime: STALE.list,
  });
}

export function useCreateIdea() {
  const { hauskreisId, keys } = useHk();

  return useApiMutation(
    (input: CreateGroupIdeaInput) => groupApi.createIdea(hauskreisId, input),
    { invalidateKeys: [keys.group.ideas] },
  );
}

/**
 * Eine Idee ändern — Titel, Notiz oder den Haken.
 *
 * Die Fassungsnummer kommt aus dem Listeneintrag selbst (`etagOfVersion`), nicht
 * aus dem Cache: Ideen haben keinen Detail-Endpunkt, und acht davon einzeln zu
 * laden, nur um acht Haken setzen zu können, wäre die falsche Antwort darauf.
 */
export function useUpdateIdea() {
  const { hauskreisId, keys } = useHk();

  return useApiMutation(
    ({ idea, input }: { idea: GroupIdea; input: UpdateGroupIdeaInput }) =>
      groupApi.updateIdea(
        hauskreisId,
        idea.id,
        input,
        etagOfVersion(idea.version),
      ),
    { invalidateKeys: [keys.group.ideas] },
  );
}

export function useDeleteIdea() {
  const { hauskreisId, keys } = useHk();

  return useApiMutation((id: string) => groupApi.deleteIdea(hauskreisId, id), {
    invalidateKeys: [keys.group.ideas],
  });
}
