'use client';

/**
 * Das eigene Profilbild — auswählen, ersetzen, entfernen.
 *
 * Der Avatar **ist** der Knopf. Ein „Bild hochladen"-Button daneben wäre ein
 * zweites Bedienelement für dieselbe Sache; dass man auf sein Gesicht tippt, um
 * es zu ändern, muss man niemandem erklären.
 *
 * Zugeschnitten und verkleinert wird auf dem Server (`sharp`, 512 Pixel, WebP).
 * Hier geht die Datei so raus, wie sie gewählt wurde — was ankommt, muss der
 * Server ohnehin prüfen, und eine Verkleinerung im Browser wäre eine zweite
 * Stelle mit denselben Regeln.
 */
import { Camera, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { useDeletePhoto, useUploadPhoto } from '@/lib/api/hooks';
import type { Person } from '@/lib/api/types';

/** Was der Server annimmt — hier nur, um früher und freundlicher abzulehnen. */
const MAX_BYTES = 5 * 1024 * 1024;

export function PhotoPicker({ person }: { person: Person }) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadPhoto();
  const remove = useDeletePhoto();
  const confirm = useConfirm();
  const toast = useToast();

  const busy = upload.isPending || remove.isPending;

  const choose = (file: File | undefined) => {
    if (!file) return;

    // Vor dem Hochladen und nicht danach: fünf Megabyte über eine
    // Mobilverbindung zu schicken, nur um dann ein „zu groß" zu lesen, ist die
    // schlechtere Reihenfolge.
    if (file.size > MAX_BYTES) {
      toast.error('Das Bild ist zu groß — bis 5 MB geht.');
      return;
    }

    upload.mutate(file, {
      onSuccess: () => toast.success('Bild gespeichert.'),
    });
  };

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        disabled={busy}
        aria-label={person.photoUpdatedAt ? 'Bild ändern' : 'Bild hinzufügen'}
        onClick={() => input.current?.click()}
        className="group relative block rounded-full"
      >
        <Avatar
          person={person}
          size="lg"
          className={busy ? 'opacity-50' : ''}
        />
        <span className="absolute -right-0.5 -bottom-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-stone-700 text-white">
          <Camera size={12} />
        </span>
      </button>

      <input
        ref={input}
        type="file"
        // Nur Bilder in der Dateiauswahl. Kein Ersatz für die Prüfung im
        // Server — `accept` ist ein Vorschlag an das Betriebssystem, keine
        // Regel.
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          choose(event.target.files?.[0]);
          // Zurücksetzen, sonst löst dieselbe Datei ein zweites Mal kein
          // `change` aus — und ein zweiter Versuch nach einem Fehlschlag täte
          // scheinbar nichts.
          event.target.value = '';
        }}
      />

      {person.photoUpdatedAt && (
        <IconButton
          label="Bild entfernen"
          disabled={busy}
          className="absolute -top-1 -right-1 h-6 w-6 rounded-full border border-line bg-card"
          onClick={async () => {
            const ok = await confirm({
              title: 'Bild entfernen?',
              body: 'Danach stehen wieder deine Initialen da.',
              confirmLabel: 'Entfernen',
              tone: 'danger',
            });
            if (!ok) return;

            remove.mutate(undefined, {
              onSuccess: () => toast.success('Bild entfernt.'),
            });
          }}
        >
          <Trash2 size={12} />
        </IconButton>
      )}
    </div>
  );
}
