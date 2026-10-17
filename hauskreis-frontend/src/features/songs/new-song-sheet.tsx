'use client';

/**
 * Ein Lied in der Liederliste anlegen — aus dem Archiv, über das „+".
 *
 * Das Gegenstück zum Vorschlagen am Termin, und bewusst etwas anderes: dort
 * geht es um *diesen Abend*, hier um den Eintrag selbst. Deshalb keine Suche
 * und keine Dubletten-Rückfrage — wer im Archiv steht, weiß, was schon da ist.
 *
 * **Darunter, wahlweise, die eigene Version** (`useOwnVersionDraft`), sobald
 * ein Link eingetragen ist.
 *
 * Geändert wird ein Lied nicht mehr hier, sondern auf seiner eigenen Seite im
 * Bearbeitungsmodus. Dorthin führt das Anlegen auch gleich.
 */
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { useCreateSong } from '@/lib/api/hooks';
import {
  SongFields,
  songInput,
  type SongFieldValues,
} from '@/components/domain/song-fields';
import { useOwnVersionDraft } from './own-version-draft';

const EMPTY: SongFieldValues = { title: '', artist: '', lyricsUrl: '' };

export function NewSongSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const create = useCreateSong();

  const [values, setValues] = useState<SongFieldValues>(EMPTY);
  const input = songInput(values);
  const own = useOwnVersionDraft(input);

  const close = () => {
    setValues(EMPTY);
    own.reset();
    onClose();
  };

  const submit = () =>
    create.mutate(input, {
      onSuccess: async (created) => {
        await own.persist(created);
        toast.success(`„${created.title}" steht in der Liste.`);
        close();
        router.push(`/lied?id=${created.id}`);
      },
    });

  return (
    <>
      {/* Zu, solange der Editor offen ist: Zwei Ebenen, die beide auf Escape
          hören, schlössen einander. Danach fährt es wieder herein, mit allem,
          was darin stand — der Zustand liegt hier und nicht im Sheet. */}
      <Sheet
        open={open && !own.editing}
        onClose={close}
        title="Lied hinzufügen"
        subtitle="Es steht dann im Archiv und lässt sich bei Terminen auswählen."
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={close}>
              Abbrechen
            </Button>
            <Button
              className="flex-1"
              loading={create.isPending || own.saving}
              disabled={input.title === ''}
              onClick={submit}
            >
              Hinzufügen
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <SongFields
            values={values}
            onChange={(patch) =>
              setValues((current) => ({ ...current, ...patch }))
            }
          />
        </div>

        {own.field}
      </Sheet>

      {own.editor}
    </>
  );
}
