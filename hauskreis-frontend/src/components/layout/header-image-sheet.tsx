'use client';

/**
 * Was man mit dem Hintergrundbild eines Bildschirms tun kann.
 *
 * Ein Sheet und nicht direkt der Dateidialog, weil es zwei Sachen sind:
 * auswählen und wieder wegnehmen. Ein Knopf, der mal das eine und mal das
 * andere tut, wäre je nach Zustand etwas anderes.
 *
 * **Das Bild gilt für die ganze Gruppe.** Das steht auch dabei — wer eins
 * hochlädt, tut das für alle neun, und das soll niemanden hinterher überraschen.
 *
 * **Den Ausschnitt wählt man selbst** ([[image-cropper]]). Vorher stand hier
 * „der Ausschnitt kommt aus der Mitte", und bei einem Gruppenfoto ist die Mitte
 * fast nie die Stelle, an der die Köpfe sind. Der Server verkleinert weiterhin
 * (`sharp`, 1280×640, WebP) — er bekommt nur jetzt schon das richtige
 * Seitenverhältnis und hat deshalb nichts mehr wegzunehmen.
 */
import { ImagePlus, RotateCcw } from 'lucide-react';
import { useRef, useState } from 'react';
import { HEADER_CROP, ImageCropper } from '@/components/ui/image-cropper';
import { Sheet } from '@/components/ui/sheet';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { useDeleteHeaderImage, useUploadHeaderImage } from '@/lib/api/hooks';
import type { HeaderScreen } from '@/lib/api/types';

/** Was der Server annimmt — hier nur, um früher und freundlicher abzulehnen. */
const MAX_BYTES = 10 * 1024 * 1024;

export function HeaderImageSheet({
  screen,
  open,
  onClose,
  hasImage,
}: {
  screen: HeaderScreen;
  open: boolean;
  onClose: () => void;
  hasImage: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadHeaderImage(screen);
  const remove = useDeleteHeaderImage(screen);
  const confirm = useConfirm();
  const toast = useToast();

  // Die gewählte Datei wartet hier, solange der Ausschnitt offen ist. Die
  // Prüfung auf die Größe gilt weiterhin dem **Original**: Zehn Megabyte erst
  // zu dekodieren, um dann abzulehnen, wäre die schlechtere Reihenfolge.
  const [pending, setPending] = useState<File | null>(null);

  const busy = upload.isPending || remove.isPending;

  const choose = (file: File | undefined) => {
    if (!file) return;

    if (file.size > MAX_BYTES) {
      toast.error('Das Bild ist zu groß — bis 10 MB geht.');
      return;
    }

    setPending(file);
  };

  return (
    <>
      {/* Die Auswahl tritt zur Seite, solange zugeschnitten wird — zwei Sheets
        übereinander hätten zwei Fokusfallen und zwei Escape-Tasten. */}
      <Sheet
        open={open && pending === null}
        onClose={onClose}
        title="Hintergrundbild"
        subtitle="Gilt für alle im Hauskreis"
      >
        <div className="space-y-2">
          <Choice
            icon={<ImagePlus size={16} />}
            label={hasImage ? 'Anderes Bild wählen' : 'Bild wählen'}
            hint="Querformat sieht am besten aus — den Ausschnitt wählst du gleich selbst."
            disabled={busy}
            onClick={() => input.current?.click()}
          />

          {hasImage && (
            <Choice
              icon={<RotateCcw size={16} />}
              label="Zurück zum Standard"
              hint="Dann steht wieder der Verlauf da."
              disabled={busy}
              onClick={async () => {
                const ok = await confirm({
                  title: 'Bild entfernen?',
                  body: 'Danach steht auf diesem Bildschirm wieder der Verlauf — für alle.',
                  confirmLabel: 'Entfernen',
                  tone: 'danger',
                });
                if (!ok) return;

                remove.mutate(undefined, {
                  onSuccess: () => {
                    toast.success('Bild entfernt.');
                    onClose();
                  },
                });
              }}
            />
          )}
        </div>

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
      </Sheet>

      <ImageCropper
        file={pending}
        target={HEADER_CROP}
        title="Hintergrundbild zuschneiden"
        busy={upload.isPending}
        onCancel={() => setPending(null)}
        onDone={(cropped) =>
          upload.mutate(cropped, {
            onSuccess: () => {
              setPending(null);
              toast.success('Bild gespeichert.');
              onClose();
            },
          })
        }
      />
    </>
  );
}

function Choice({
  icon,
  label,
  hint,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-line bg-card px-4 py-3 text-left transition-colors hover:border-terracotta-400 disabled:opacity-50"
    >
      <span className="shrink-0 text-terracotta-500">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-stone-800">{label}</span>
        <span className="block text-[11px] text-stone-400">{hint}</span>
      </span>
    </button>
  );
}
