'use client';

/**
 * Die eigenen Versionen als Abfrage — damit Liste, Liedseite und die kleinen
 * Symbole an jeder Liedzeile aus demselben Bestand lesen.
 *
 * **Eine Abfrage für alle**, nicht eine je Lied: Es sind ein paar Dutzend
 * Einträge zu je ein paar Kilobyte, und „hat diese Zeile eine eigene Version"
 * fragen viele Zeilen gleichzeitig. Eine Liste, aus der jede ihr Lied holt,
 * ist ein einziger Lesevorgang.
 *
 * **`networkMode: 'always'`.** TanStack Query hält Abfragen ohne Netz
 * standardmäßig an — für etwas, das nie ins Netz geht, wäre das genau falsch.
 * Und `staleTime: Infinity`: Ändern kann es nur dieses Gerät, und das schreibt
 * den Zwischenspeicher bei jeder Änderung selbst.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { useMemo } from 'react';
import { useHk, useMe } from '@/lib/api/hooks';
import { listOwnSongs, putOwnSong, removeOwnSong, type OwnSong } from './store';

function ownSongsKey(personId: string, hauskreisId: string): QueryKey {
  return ['eigene-lieder', personId, hauskreisId];
}

/** Wessen Versionen gelesen werden — erst, wenn feststeht, wer man ist. */
function useOwner() {
  const { hauskreisId, enabled } = useHk();
  const me = useMe();
  const personId = me.me?.id ?? '';

  return {
    personId,
    hauskreisId,
    ready: enabled && personId !== '' && typeof indexedDB !== 'undefined',
    key: ownSongsKey(personId, hauskreisId),
  };
}

export function useOwnSongs() {
  const owner = useOwner();

  return useQuery({
    queryKey: owner.key,
    queryFn: () => listOwnSongs(owner.personId, owner.hauskreisId),
    enabled: owner.ready,
    staleTime: Infinity,
    networkMode: 'always',
    retry: false,
  });
}

/** Die eigene Version eines Lieds, oder `null`. */
export function useOwnSong(songId: string | undefined) {
  const list = useOwnSongs();
  const song = list.data?.find((entry) => entry.songId === songId) ?? null;

  return { song, isLoading: list.isLoading, error: list.error };
}

/** Welche Lieder eine eigene Version haben — für das Symbol in den Listen. */
export function useOwnSongIds(): ReadonlySet<string> {
  const list = useOwnSongs();
  return useMemo(
    () => new Set((list.data ?? []).map((entry) => entry.songId)),
    [list.data],
  );
}

/** Was beim Speichern aus dem Editor kommt. */
export interface OwnSongDraft {
  songId: string;
  title: string;
  artist: string | null;
  text: string;
  key: string | null;
  capo: number | null;
}

/** Die Felder, die sich ohne neuen Text ändern. */
export type OwnSongSettings = Partial<
  Pick<OwnSong, 'transpose' | 'scrollSpeed' | 'title' | 'artist'>
>;

const DEFAULT_SCROLL_SPEED = 4;

function useWrite<Input>(
  write: (
    input: Input,
    current: OwnSong[],
    owner: { personId: string; hauskreisId: string },
  ) => Promise<OwnSong[]>,
) {
  const owner = useOwner();
  const queryClient = useQueryClient();

  return useMutation({
    networkMode: 'always',
    mutationFn: async (input: Input) => {
      if (!owner.ready) throw new Error('Noch nicht angemeldet.');
      const current =
        queryClient.getQueryData<OwnSong[]>(owner.key) ??
        (await listOwnSongs(owner.personId, owner.hauskreisId));
      return write(input, current, owner);
    },
    onSuccess: (next) => queryClient.setQueryData(owner.key, next),
  });
}

/**
 * Eine Version speichern — neu oder überschrieben.
 *
 * Was am Lied hängt und nicht am Text (Transposition, Scrolltempo), bleibt
 * beim Überschreiben stehen: Wer seine Version korrigiert, hat dieselbe
 * Tonart noch im Ohr.
 *
 * Eine gemerkte Transposition fällt dagegen weg, wenn sich die Tonart des
 * Blatts selbst ändert — sie hieße sonst „zwei Halbtöne höher als ein Blatt,
 * das es so nicht mehr gibt".
 */
export function useSaveOwnSong() {
  return useWrite<OwnSongDraft>(async (draft, current, owner) => {
    const now = new Date().toISOString();
    const previous = current.find((entry) => entry.songId === draft.songId);

    const song: OwnSong = {
      ...owner,
      ...draft,
      transpose:
        previous && previous.key === draft.key ? previous.transpose : 0,
      scrollSpeed: previous?.scrollSpeed ?? DEFAULT_SCROLL_SPEED,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };

    await putOwnSong(song);
    return [...current.filter((entry) => entry.songId !== song.songId), song];
  });
}

/** Tonart, Tempo oder Schnappschuss nachziehen, ohne den Text anzufassen. */
export function useUpdateOwnSong() {
  return useWrite<{ songId: string; settings: OwnSongSettings }>(
    async ({ songId, settings }, current) => {
      const previous = current.find((entry) => entry.songId === songId);
      if (!previous) return current;

      const song: OwnSong = { ...previous, ...settings };
      await putOwnSong(song);
      return current.map((entry) => (entry.songId === songId ? song : entry));
    },
  );
}

export function useRemoveOwnSong() {
  return useWrite<string>(async (songId, current, owner) => {
    await removeOwnSong(owner.personId, songId);
    return current.filter((entry) => entry.songId !== songId);
  });
}
