'use client';

/**
 * Ein Lied in der Liederliste anlegen oder ändern.
 *
 * Das Gegenstück zum Vorschlagen am Termin, und bewusst etwas anderes: dort
 * geht es um *diesen Abend*, hier um den Eintrag selbst. Deshalb keine Suche
 * und keine Dubletten-Rückfrage — wer im Archiv steht, weiß, was schon da ist.
 *
 * Der Songtext wird nicht gespeichert, nur verlinkt (CLAUDE.md §6) — der Link
 * darf auf ein Akkordblatt zeigen, deshalb heißt das Feld nicht „Songtext".
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { ConflictBanner } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useCreateSong, useSong, useUpdateSong } from '@/lib/api/hooks';
import type { SongListItem } from '@/lib/api/types';
import { OpenLinkButton } from './lyrics-link';
import { SongAiAssist } from './song-ai-assist';

export function SongSheet({
  open,
  onClose,
  song,
}: {
  open: boolean;
  onClose: () => void;
  /** Gesetzt heißt: bearbeiten statt anlegen. */
  song?: SongListItem;
}) {
  return song ? (
    <EditSong open={open} onClose={onClose} song={song} />
  ) : (
    <CreateSong open={open} onClose={onClose} />
  );
}

/** Titel, Interpret, Link — an beiden Wegen dieselben drei Felder. */
function SongFields({
  title,
  setTitle,
  artist,
  setArtist,
  lyricsUrl,
  setLyricsUrl,
}: {
  title: string;
  setTitle: (value: string) => void;
  artist: string;
  setArtist: (value: string) => void;
  lyricsUrl: string;
  setLyricsUrl: (value: string) => void;
}) {
  return (
    <>
      <Field label="Titel">
        <TextInput
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Gott ist gut"
        />
      </Field>

      <Field label="Interpret">
        <TextInput
          value={artist}
          onChange={(event) => setArtist(event.target.value)}
          placeholder="Outbreakband"
        />
      </Field>

      {/* Text *oder* Akkorde: bei uns spielen vier Leute, und ein Akkordblatt
          ist für die genauso der richtige Link. */}
      <Field
        label="Link zu Text/Chords"
      >
        {/* Der Knopf daneben, nicht darunter: er gehört zu diesem Feld und
            erscheint erst, wenn darin etwas steht, das eine Adresse ist. */}
        <div className="flex items-center gap-2">
          <TextInput
            type="url"
            inputMode="url"
            value={lyricsUrl}
            onChange={(event) => setLyricsUrl(event.target.value)}
            placeholder="https://…"
          />
          <OpenLinkButton url={lyricsUrl.trim()} />
        </div>
      </Field>

      <SongAiAssist
        draft={{ title, artist, lyricsUrl }}
        onApply={(patch) => {
          if (patch.title !== undefined) setTitle(patch.title);
          if (patch.artist !== undefined) setArtist(patch.artist);
          if (patch.lyricsUrl !== undefined) setLyricsUrl(patch.lyricsUrl);
        }}
      />
    </>
  );
}

function CreateSong({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [lyricsUrl, setLyricsUrl] = useState('');

  const create = useCreateSong();
  const toast = useToast();

  const close = () => {
    setTitle('');
    setArtist('');
    setLyricsUrl('');
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Lied hinzufügen"
      subtitle="Es steht danach in eurer Liederliste und lässt sich an jedem Abend auswählen."
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={close}>
            Abbrechen
          </Button>
          <Button
            className="flex-1"
            loading={create.isPending}
            disabled={title.trim() === ''}
            onClick={() =>
              create.mutate(
                {
                  title: title.trim(),
                  artist: artist.trim() === '' ? null : artist.trim(),
                  lyricsUrl: lyricsUrl.trim() === '' ? null : lyricsUrl.trim(),
                },
                {
                  onSuccess: (created) => {
                    toast.success(`„${created.title}" steht in der Liste.`);
                    close();
                  },
                },
              )
            }
          >
            Hinzufügen
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <SongFields
          title={title}
          setTitle={setTitle}
          artist={artist}
          setArtist={setArtist}
          lyricsUrl={lyricsUrl}
          setLyricsUrl={setLyricsUrl}
        />
      </div>
    </Sheet>
  );
}

function EditSong({
  open,
  onClose,
  song,
}: {
  open: boolean;
  onClose: () => void;
  song: SongListItem;
}) {
  // Schreiben verlangt einen ETag, und der liegt beim geladenen Einzelstand —
  // die Liste aus dem Archiv bringt keinen mit.
  const resource = useSong(song.id);
  const update = useUpdateSong(song.id);
  const toast = useToast();

  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist ?? '');
  const [lyricsUrl, setLyricsUrl] = useState(song.lyricsUrl ?? '');

  // Kommt der frische Stand nach (oder ein fremder nach einem Konflikt),
  // übernehmen die Felder ihn.
  useEffect(() => {
    const loaded = resource.data?.data;
    if (!loaded) return;

    setTitle(loaded.title);
    setArtist(loaded.artist ?? '');
    setLyricsUrl(loaded.lyricsUrl ?? '');
  }, [resource.data]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Lied bearbeiten"
      subtitle={
        song.timesPlayed > 0
          ? `${song.timesPlayed}× gesungen — die Änderung gilt auch für diese Abende.`
          : undefined
      }
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            className="flex-1"
            loading={update.isPending}
            disabled={resource.isLoading || title.trim() === ''}
            onClick={() =>
              update.mutate(
                {
                  title: title.trim(),
                  artist: artist.trim() === '' ? null : artist.trim(),
                  lyricsUrl: lyricsUrl.trim() === '' ? null : lyricsUrl.trim(),
                },
                {
                  onSuccess: () => {
                    toast.success('Gespeichert.');
                    onClose();
                  },
                },
              )
            }
          >
            Speichern
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {update.conflict && (
          <ConflictBanner
            onReload={() => void resource.refetch()}
            onDismiss={update.dismissConflict}
          />
        )}

        <SongFields
          title={title}
          setTitle={setTitle}
          artist={artist}
          setArtist={setArtist}
          lyricsUrl={lyricsUrl}
          setLyricsUrl={setLyricsUrl}
        />
      </div>
    </Sheet>
  );
}
