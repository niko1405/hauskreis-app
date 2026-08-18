'use client';

/**
 * Welchen Ausschnitt eines Bildes man behält — und wie er hinterher aussieht.
 *
 * **Warum es das gibt.** Bisher schnitt der Server aus der Mitte
 * (`sharp`, `fit: 'cover'`, `position: 'centre'`), und in der Auswahl stand als
 * Hinweis „der Ausschnitt kommt aus der Mitte". Für ein Gruppenfoto ist die
 * Mitte fast nie die richtige Stelle: Köpfe sitzen oben, ein Querformat wird
 * zum Quadrat beschnitten, und wer es anders wollte, musste das Bild vorher in
 * einer anderen App zuschneiden. Hier sieht man vor dem Hochladen, was ankommt.
 *
 * **Zugeschnitten wird im Gerät, nicht am Server.** Was hochgeht, ist das
 * fertige Bild — und damit bleibt der Server unverändert: `fit: 'cover'` auf
 * ein Bild, das schon das richtige Seitenverhältnis hat, schneidet nichts mehr
 * weg und skaliert nur noch. Der Preis ist, dass sich der Ausschnitt später
 * nicht nachjustieren lässt, ohne die Datei erneut zu wählen. Die Alternative
 * wäre, Original **und** Ausschnittsrahmen zu speichern und bei jeder Auslieferung
 * zu rechnen — für vier Bilder, die man selten wechselt, ein eigenes Projekt.
 *
 * **Ein Werkzeug für zwei Stellen.** Kopfbild (2:1) und Profilbild (1:1, rund)
 * unterscheiden sich in `aspect`, `shape` und der Zielgröße; alles andere —
 * Ziehen, Zoomen, Zeichnen, Verpacken — ist dasselbe. Genau das war die
 * Bedingung: derselbe Mechanismus für beide.
 */
import { useCallback, useEffect, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { Button } from './button';
import { Sheet } from './sheet';

export interface CropTarget {
  /** Breite geteilt durch Höhe — 2 fürs Kopfbild, 1 fürs Profilbild. */
  aspect: number;
  /** Der Rahmen, den man sieht. Rund nur dort, wo das Bild später rund ist. */
  shape: 'rect' | 'round';
  /** Kantenlänge der Ausgabe in Pixeln (Breite; die Höhe folgt aus `aspect`). */
  width: number;
}

export const HEADER_CROP: CropTarget = {
  aspect: 2,
  shape: 'rect',
  width: 1280,
};
export const AVATAR_CROP: CropTarget = {
  aspect: 1,
  shape: 'round',
  width: 512,
};

export function ImageCropper({
  file,
  target,
  title,
  busy,
  onCancel,
  onDone,
}: {
  /** `null` schließt — der Aufrufer hält die gewählte Datei. */
  file: File | null;
  target: CropTarget;
  title: string;
  busy?: boolean;
  onCancel: () => void;
  onDone: (cropped: File) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [working, setWorking] = useState(false);

  // Eine Objekt-Adresse statt `readAsDataURL`: Ein Foto vom Telefon wiegt
  // mehrere Megabyte, und als Base64 stünde es ein Drittel größer nochmal im
  // Speicher. Freigegeben wird sie, sobald eine andere Datei kommt oder das
  // Sheet zugeht — sonst hält der Browser das Bild bis zum Neuladen fest.
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }

    const next = URL.createObjectURL(file);
    setUrl(next);
    // Bei jeder neuen Datei von vorn: Ein Zoom von der letzten Wahl wäre auf
    // einem anders geschnittenen Bild eine willkürliche Vergrößerung.
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setArea(null);

    return () => URL.revokeObjectURL(next);
  }, [file]);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setArea(pixels);
  }, []);

  const confirm = async () => {
    if (!file || !url || !area) return;

    setWorking(true);
    try {
      onDone(await cutOut(url, area, target, file.name));
    } finally {
      setWorking(false);
    }
  };

  const height = Math.round(target.width / target.aspect);
  const disabled = busy || working || !area;

  return (
    <Sheet
      open={file !== null}
      onClose={onCancel}
      title={title}
      subtitle="Ziehen zum Verschieben, zwei Finger zum Zoomen"
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy || working}>
            Abbrechen
          </Button>
          <Button
            className="flex-1"
            onClick={confirm}
            loading={busy || working}
            disabled={disabled}
          >
            Übernehmen
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Die Bühne braucht eine Höhe, die nicht vom Bild kommt: `Cropper`
            stellt sich absolut in seinen Elternteil, und der wäre ohne Angabe
            null Pixel hoch. */}
        <div className="relative h-64 overflow-hidden rounded-card bg-stone-900">
          {url && (
            <Cropper
              image={url}
              crop={crop}
              zoom={zoom}
              aspect={target.aspect}
              cropShape={target.shape}
              showGrid={target.shape === 'rect'}
              minZoom={1}
              maxZoom={4}
              restrictPosition
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          )}
        </div>

        {/* Der Regler ist für die Maus da — auf dem Telefon zoomt man mit zwei
            Fingern, am Rechner gibt es die nicht. */}
        <label className="flex items-center gap-3">
          <span className="text-[11px] font-semibold tracking-wider text-stone-400 uppercase">
            Zoom
          </span>
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-line-strong accent-terracotta-500"
            aria-label="Zoom"
          />
        </label>

        <p className="text-[11px] leading-relaxed text-stone-400">
          Gespeichert wird der Ausschnitt mit {target.width}×{height} Pixeln.
          Was außerhalb des Rahmens liegt, ist danach weg.
        </p>
      </div>
    </Sheet>
  );
}

/**
 * Den gewählten Bereich auf eine Leinwand zeichnen und als Datei verpacken.
 *
 * `area` kommt in **Pixeln des Originals** (react-easy-crop rechnet das aus
 * Zoom und Verschiebung zurück), gezeichnet wird direkt auf die Zielgröße —
 * ein Zwischenschritt in Originalgröße würde nur Speicher kosten.
 *
 * WebP und nicht JPEG: Der Server legt ohnehin WebP ab, und wer schon einmal
 * neu kodiert, tut es besser einmal verlustarm als zweimal.
 */
async function cutOut(
  url: string,
  area: Area,
  target: CropTarget,
  originalName: string,
): Promise<File> {
  const image = await load(url);

  const canvas = document.createElement('canvas');
  canvas.width = target.width;
  canvas.height = Math.round(target.width / target.aspect);

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Der Browser gibt keine Zeichenfläche her');

  context.imageSmoothingQuality = 'high';
  context.drawImage(
    image,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.92),
  );
  if (!blob) throw new Error('Der Zuschnitt ließ sich nicht speichern');

  // Der Name behält seinen Stamm, damit im Zweifel erkennbar bleibt, welches
  // Bild das war; die Endung muss zum Inhalt passen.
  const stem = originalName.replace(/\.[^.]+$/, '') || 'bild';
  return new File([blob], `${stem}.webp`, { type: 'image/webp' });
}

function load(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', () =>
      reject(new Error('Das Bild ließ sich nicht laden')),
    );
    image.src = url;
  });
}
