'use client';

/**
 * Welchen Ausschnitt eines Bildes man behält — und wie er hinterher aussieht.
 *
 * **Warum es das gibt.** Für ein Gruppenfoto ist die Mitte fast nie die
 * richtige Stelle: Köpfe sitzen oben, und ein Querformat wird zum Quadrat
 * beschnitten. Hier sieht man vor dem Hochladen, was ankommt.
 *
 * **Zugeschnitten wird im Gerät, nicht am Server.** Was hochgeht, ist das
 * fertige Bild: `fit: 'cover'` am Server auf ein Bild, das schon das richtige
 * Seitenverhältnis hat, schneidet nichts mehr weg und skaliert nur noch. Der Preis ist, dass sich der Ausschnitt später
 * nicht nachjustieren lässt, ohne die Datei erneut zu wählen. Die Alternative
 * wäre, Original **und** Ausschnittsrahmen zu speichern und bei jeder Auslieferung
 * zu rechnen — für vier Bilder, die man selten wechselt, ein eigenes Projekt.
 *
 * **Schwarze Ränder fallen vorher weg** (`withoutBorders`). Ein Videostandbild
 * oder ein Screenshot bringt seine Balken mit, und im Kopfbild stünden sie
 * dann da — im breiten Fenster sichtbar, auf dem Telefon meist nicht, also
 * leicht zu übersehen. Zugeschnitten wird deshalb gleich das Bild ohne sie.
 *
 * **Ein Werkzeug für zwei Stellen.** Kopfbild (2:1) und Profilbild (1:1, rund)
 * unterscheiden sich in `aspect`, `shape` und der Zielgröße; alles andere —
 * Ziehen, Zoomen, Zeichnen, Verpacken — ist dasselbe. Genau das war die
 * Bedingung: derselbe Mechanismus für beide.
 */
import { useCallback, useEffect, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { contentBox } from '@/lib/image-borders';
import { Button } from './button';
import { Sheet } from './sheet';

export interface CropTarget {
  /** Breite geteilt durch Höhe — 2 fürs Kopfbild, 1 fürs Profilbild. */
  aspect: number;
  /** Der Rahmen, den man sieht. Rund nur dort, wo das Bild später rund ist. */
  shape: 'rect' | 'round';
  /** Kantenlänge der Ausgabe in Pixeln (Breite; die Höhe folgt aus `aspect`). */
  width: number;
  /**
   * Was je nach Gerät vom Rand wegfällt, als Anteil einer Kante.
   *
   * **Warum es das überhaupt gibt.** Gespeichert wird ein festes Format,
   * angezeigt wird mit `background-size: cover` in einem Kasten, dessen Höhe
   * aus dem Inhalt kommt und dessen Breite vom Gerät. Beides deckt sich nur
   * zufällig, und ein einziger Ausschnitt kann 1,5:1 und 5:1 nicht gleichzeitig
   * bedienen — irgendetwas fällt weg.
   *
   * Statt so zu tun, als wäre der Rahmen die ganze Wahrheit, steht es drin.
   */
  trim?: {
    /** Je Seite, auf dem schmalsten Telefon (Kopfzeile 1,50:1 gegen 2:1). */
    sides: number;
    /** Oben und unten, in einem breiten Fenster (4,9:1 gegen 2:1). */
    topBottom: number;
  };
}

export const HEADER_CROP: CropTarget = {
  aspect: 2,
  shape: 'rect',
  width: 1280,
  // Auf einem iPhone mit Notch wird die Kopfzeile durch den sicheren Rand
  // höher und damit im Format schmaler (1,50:1) — dort fehlt seitlich je ein
  // Achtel. In einem breiten Fenster kippt es um: Bei 4,9:1 bleiben nur gut
  // 40 % der Höhe stehen. Die Zahlen stammen aus dem CSS von
  // `screen-header.tsx`; ändert sich dort der Abstand, gehören sie nachgezogen.
  trim: { sides: 0.125, topBottom: 0.3 },
};
// Kein `trim`: Ein Profilbild steht immer in einem Kreis mit festem
// Seitenverhältnis. Was man wählt, ist auch das, was man sieht.
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
  /** Ob schwarze Ränder weggenommen wurden — das steht dann dabei. */
  const [trimmed, setTrimmed] = useState(false);

  // Eine Objekt-Adresse statt `readAsDataURL`: Ein Foto vom Telefon wiegt
  // mehrere Megabyte, und als Base64 stünde es ein Drittel größer nochmal im
  // Speicher. Freigegeben wird sie, sobald eine andere Datei kommt oder das
  // Sheet zugeht — sonst hält der Browser das Bild bis zum Neuladen fest.
  //
  // Gezeigt wird erst nach dem Blick auf die Ränder. Zuerst das Original und
  // dann das beschnittene hieße, dass der Ausschnitt unter dem Finger springt.
  useEffect(() => {
    setTrimmed(false);
    if (!file) {
      setUrl(null);
      return;
    }

    const original = URL.createObjectURL(file);
    let cut: string | null = null;
    let cancelled = false;

    setUrl(null);
    // Bei jeder neuen Datei von vorn: Ein Zoom von der letzten Wahl wäre auf
    // einem anders geschnittenen Bild eine willkürliche Vergrößerung.
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setArea(null);

    withoutBorders(original)
      .catch(() => null)
      .then((result) => {
        if (cancelled) {
          if (result) URL.revokeObjectURL(result);
          return;
        }
        cut = result;
        setUrl(result ?? original);
        setTrimmed(result !== null);
      });

    return () => {
      cancelled = true;
      URL.revokeObjectURL(original);
      if (cut) URL.revokeObjectURL(cut);
    };
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
        {/* Die Bühne trägt **genau** das Zielformat, und das ist kein Zufall:
            Damit füllt der Zuschnitt-Rahmen den Kasten vollständig aus, und die
            Markierungen darunter hängen sich schlicht an `inset-0`, statt die
            Lage des Rahmens nachzurechnen. Eine Höhe braucht der Kasten
            trotzdem — `Cropper` stellt sich absolut hinein. */}
        <div
          className="relative overflow-hidden rounded-card bg-stone-900"
          style={{ aspectRatio: String(target.aspect) }}
        >
          {url && (
            <Cropper
              image={url}
              crop={crop}
              zoom={zoom}
              aspect={target.aspect}
              cropShape={target.shape}
              showGrid={false}
              minZoom={1}
              maxZoom={4}
              restrictPosition
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          )}

          {target.trim && <TrimGuides trim={target.trim} />}
        </div>

        {trimmed && (
          <p className="text-[11px] leading-relaxed text-stone-500">
            Schwarze Ränder am Bild wurden entfernt.
          </p>
        )}

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

        {target.trim ? (
          <div className="space-y-1.5 text-[11px] leading-relaxed text-stone-400">
            <p>
              Gespeichert wird der Ausschnitt mit {target.width}×{height}{' '}
              Pixeln. Wie viel davon zu sehen ist, hängt am Gerät — deshalb die
              Markierungen:
            </p>
            <p className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block size-2.5 shrink-0 rounded-[2px] bg-stone-500"
              />
              fällt auf dem Handy weg (seitlich)
            </p>
            <p className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block size-2.5 shrink-0 rounded-[2px] bg-stone-300"
              />
              fällt in einem breiten Fenster weg (oben und unten)
            </p>
            <p className="text-stone-500">
              Was innerhalb der gestrichelten Linie steht, ist überall zu sehen.
            </p>
          </div>
        ) : (
          <p className="text-[11px] leading-relaxed text-stone-400">
            Gespeichert wird der Ausschnitt mit {target.width}×{height} Pixeln.
            Was außerhalb des Rahmens liegt, ist danach weg.
          </p>
        )}
      </div>
    </Sheet>
  );
}

/**
 * Zeigt, was je nach Gerät vom Rand wegfällt.
 *
 * Zwei Sorten, weil es zwei Fälle sind und sie in verschiedene Richtungen
 * gehen: Auf dem Telefon macht der sichere Rand die Kopfzeile höher, das Format
 * wird schmaler, und abgeschnitten wird **seitlich**. In einem breiten Fenster
 * ist die Kopfzeile ein flacher Streifen, und abgeschnitten wird **oben und
 * unten**. Die Ecken liegen in beidem — dass sie am dunkelsten sind, ist keine
 * Absicht, aber richtig.
 *
 * Zurückhaltend gedeckt und ohne Klickfang: Es ist ein Hinweis darauf, wo man
 * das Gesicht besser nicht hinlegt, keine Sperre. Wer den Rand ausnutzen will,
 * darf.
 */
function TrimGuides({ trim }: { trim: NonNullable<CropTarget['trim']> }) {
  const sides = `${trim.sides * 100}%`;
  const bands = `${trim.topBottom * 100}%`;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div
        className="absolute inset-x-0 top-0 bg-stone-900/30"
        style={{ height: bands }}
      />
      <div
        className="absolute inset-x-0 bottom-0 bg-stone-900/30"
        style={{ height: bands }}
      />
      <div
        className="absolute inset-y-0 left-0 bg-stone-900/45"
        style={{ width: sides }}
      />
      <div
        className="absolute inset-y-0 right-0 bg-stone-900/45"
        style={{ width: sides }}
      />
      <div
        className="absolute border border-dashed border-white/60"
        style={{ inset: `${bands} ${sides}` }}
      />
    </div>
  );
}

/** Kantenlänge, auf die zum Messen verkleinert wird — genug für Balken. */
const SAMPLE = 256;

/**
 * Das Bild ohne seine schwarzen Ränder, als neue Objekt-Adresse — oder `null`,
 * wenn es keine hat.
 *
 * Gemessen wird an einer verkleinerten Fassung (`contentBox` über höchstens
 * `SAMPLE` Pixel), geschnitten in voller Größe: Ein Foto vom Telefon Pixel für
 * Pixel abzusuchen, kostete eine spürbare Pause vor dem Zuschnitt.
 */
async function withoutBorders(url: string): Promise<string | null> {
  const image = await load(url);
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (width === 0 || height === 0) return null;

  const scale = Math.min(1, SAMPLE / Math.max(width, height));
  const sampleWidth = Math.max(1, Math.round(width * scale));
  const sampleHeight = Math.max(1, Math.round(height * scale));

  const sample = document.createElement('canvas');
  sample.width = sampleWidth;
  sample.height = sampleHeight;
  const sampleContext = sample.getContext('2d', { willReadFrequently: true });
  if (!sampleContext) return null;

  sampleContext.drawImage(image, 0, 0, sampleWidth, sampleHeight);
  const box = contentBox(
    sampleContext.getImageData(0, 0, sampleWidth, sampleHeight).data,
    sampleWidth,
    sampleHeight,
  );
  if (!box) return null;

  // Zurück in Pixel des Originals, nach innen gerundet: lieber ein Pixel Foto
  // weniger als ein Pixel Balken mehr.
  const factorX = width / sampleWidth;
  const factorY = height / sampleHeight;
  const left = Math.ceil(box.x * factorX);
  const top = Math.ceil(box.y * factorY);
  const right = Math.floor((box.x + box.width) * factorX);
  const bottom = Math.floor((box.y + box.height) * factorY);
  if (right <= left || bottom <= top) return null;

  const canvas = document.createElement('canvas');
  canvas.width = right - left;
  canvas.height = bottom - top;
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.drawImage(
    image,
    left,
    top,
    canvas.width,
    canvas.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  // Fast verlustfrei: Das hier ist ein Zwischenschritt, die eigentliche
  // Kodierung kommt erst beim Übernehmen (`cutOut`).
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.95),
  );
  return blob ? URL.createObjectURL(blob) : null;
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
