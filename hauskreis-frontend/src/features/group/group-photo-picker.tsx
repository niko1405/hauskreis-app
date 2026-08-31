'use client';

/**
 * Das Bild des Hauskreises — auswählen, ersetzen, entfernen.
 *
 * Zuschnitt Zeile für Zeile von `PhotoPicker`: Das Bild **ist** der Knopf, der
 * Ausschnitt wird im Browser gewählt, der Server verkleinert. Es ist dieselbe
 * Sache, nur für die Gruppe statt für eine Person — und wie beim Kopfbild darf
 * jede:r es tauschen. Bei neun Leuten ist das keine
 * Verwaltungsangelegenheit.
 */
import { Camera, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { IconButton } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { AVATAR_CROP, ImageCropper } from '@/components/ui/image-cropper';
import { useToast } from '@/components/ui/toast';
import { GroupAvatar } from '@/components/layout/group-avatar';
import { useDeleteGroupPhoto, useUploadGroupPhoto } from '@/lib/api/hooks';

/** Was der Server annimmt — hier nur, um früher und freundlicher abzulehnen. */
const MAX_BYTES = 5 * 1024 * 1024;

export function GroupPhotoPicker({ hasPhoto }: { hasPhoto: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadGroupPhoto();
  const remove = useDeleteGroupPhoto();
  const confirm = useConfirm();
  const toast = useToast();

  // Die Prüfung gilt dem **Original**: ein 40-MB-Foto erst zu dekodieren, um
  // dann abzulehnen, wäre die schlechtere Reihenfolge.
  const [pending, setPending] = useState<File | null>(null);
  const busy = upload.isPending || remove.isPending;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        disabled={busy}
        aria-label={hasPhoto ? 'Gruppenbild ändern' : 'Gruppenbild hinzufügen'}
        onClick={() => input.current?.click()}
        className="relative block rounded-full"
      >
        <GroupAvatar size="xl" className={busy ? 'opacity-50' : ''} />
        <span className="absolute right-0.5 bottom-0.5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-card bg-inverse text-inverse-fg">
          <Camera size={15} />
        </span>
      </button>

      <input
        ref={input}
        type="file"
        // `accept` ist ein Vorschlag an das Betriebssystem, keine Regel — die
        // Prüfung im Server bleibt.
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Zurücksetzen, sonst löst dieselbe Datei kein zweites `change` aus.
          event.target.value = '';

          if (!file) return;
          if (file.size > MAX_BYTES) {
            toast.error('Das Bild ist zu groß — bis 5 MB geht.');
            return;
          }
          setPending(file);
        }}
      />

      <ImageCropper
        file={pending}
        // Derselbe Zuschnitt wie beim Profilbild: rund, quadratisch, 512. Eine
        // eigene Konstante daneben wäre dieselbe Zahlenreihe mit einem zweiten
        // Namen.
        target={AVATAR_CROP}
        title="Gruppenbild zuschneiden"
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

      {hasPhoto && (
        <IconButton
          label="Gruppenbild entfernen"
          disabled={busy}
          className="absolute top-0 right-0 h-7 w-7 rounded-full border border-line bg-card"
          onClick={async () => {
            const ok = await confirm({
              title: 'Gruppenbild entfernen?',
              body: 'Danach stehen wieder die Anfangsbuchstaben da.',
              confirmLabel: 'Entfernen',
              tone: 'danger',
            });
            if (!ok) return;

            remove.mutate(undefined, {
              onSuccess: () => toast.success('Bild entfernt.'),
            });
          }}
        >
          <Trash2 size={13} />
        </IconButton>
      )}
    </div>
  );
}
