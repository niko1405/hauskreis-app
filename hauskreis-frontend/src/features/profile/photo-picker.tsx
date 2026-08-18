'use client';

/**
 * Das eigene Profilbild — auswählen, ersetzen, entfernen.
 *
 * Der Avatar **ist** der Knopf. Ein „Bild hochladen"-Button daneben wäre ein
 * zweites Bedienelement für dieselbe Sache; dass man auf sein Gesicht tippt, um
 * es zu ändern, muss man niemandem erklären.
 *
 * **Den Ausschnitt wählt man selbst** ([[image-cropper]]). Vorher schnitt der
 * Server aus der Mitte, und bei einem Hochformat war das oft der Hals. Der
 * Server verkleinert weiterhin (`sharp`, 512 Pixel, WebP) — er bekommt nur
 * jetzt schon ein quadratisches Bild und hat deshalb nichts mehr wegzunehmen.
 */
import { Camera, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { AVATAR_CROP, ImageCropper } from '@/components/ui/image-cropper';
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

  // Die gewählte Datei wartet hier, solange der Ausschnitt offen ist. Die
  // Prüfung auf die Größe gilt weiterhin dem **Original**: Ein 40-MB-Foto erst
  // zu dekodieren, um dann abzulehnen, wäre die schlechtere Reihenfolge.
  const [pending, setPending] = useState<File | null>(null);

  const busy = upload.isPending || remove.isPending;

  const choose = (file: File | undefined) => {
    if (!file) return;

    if (file.size > MAX_BYTES) {
      toast.error('Das Bild ist zu groß — bis 5 MB geht.');
      return;
    }

    setPending(file);
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
        <span className="absolute -right-0.5 -bottom-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-inverse text-inverse-fg">
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

      <ImageCropper
        file={pending}
        target={AVATAR_CROP}
        title="Profilbild zuschneiden"
        busy={upload.isPending}
        onCancel={() => setPending(null)}
        onDone={(cropped) =>
          upload.mutate(cropped, {
            onSuccess: () => {
              setPending(null);
              toast.success('Bild gespeichert.');
            },
          })
        }
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
