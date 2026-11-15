/**
 * Schwarze Ränder an einem Bild finden — die Balken eines Videostandbilds oder
 * eines Screenshots, auf dem ein Foto mit Rand dastand.
 *
 * **Warum es das gibt.** Ein Kopfbild steht mit `background-size: cover` da,
 * und was im Bild ist, ist im Kopf. Steckt ein schwarzer Balken darin, steht er
 * da — auf dem Telefon fällt seitlich ein Achtel weg und versteckt ihn, im
 * breiten Fenster nicht. Wer das Bild hochlädt, sieht den Balken im Zuschnitt
 * kaum als Fehler; also nimmt die App ihn weg, bevor zugeschnitten wird.
 *
 * **Nur fast Schwarz, und nur ganze Zeilen.** Eine Zeile zählt als Rand, wenn
 * so gut wie alle ihre Pixel fast schwarz sind (`DARK`, `SHARE`). Ein dunkles
 * Foto hat irgendwo darin etwas Helleres; ein gleichmäßiger Himmel ist nicht
 * schwarz. Gesucht wird von jeder Kante nach innen bis zur ersten echten Zeile.
 * **Reicht das Schwarz auf einer Seite bis `MAX_SIDE`, ist es kein Rand**,
 * sondern das Foto selbst — eine Nacht, ein dunkler Raum —, und es bleibt, wie
 * es ist. Ein Balken hört vorher auf.
 *
 * Eine reine Funktion über Pixeldaten, damit sie sich ohne Browser prüfen
 * lässt; gezeichnet und gemessen wird im Zuschnitt (`image-cropper.tsx`).
 */

/**
 * Helligkeit (0–255), unter der ein Pixel als schwarz zählt. Balken sind
 * reines Schwarz plus etwas Kompressionsrauschen; ein dunkles Foto liegt
 * meistens darüber.
 */
const DARK = 20;
/** Anteil schwarzer Pixel, ab dem eine Zeile oder Spalte ein Rand ist. */
const SHARE = 0.98;
/** Ab diesem Anteil je Seite ist das Schwarz kein Rand mehr. */
const MAX_SIDE = 0.4;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Das Rechteck des eigentlichen Bildes in Pixeln von `data` — oder `null`,
 * wenn es keinen Rand gibt.
 *
 * `data` ist RGBA wie aus `getImageData`, `width` × `height` Pixel.
 */
export function contentBox(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Box | null {
  const dark = (index: number) => {
    const offset = index * 4;
    // Ein durchsichtiges Pixel ist kein Balken, sondern gar nichts.
    if (data[offset + 3]! < 128) return false;
    const luma =
      0.2126 * data[offset]! +
      0.7152 * data[offset + 1]! +
      0.0722 * data[offset + 2]!;
    return luma < DARK;
  };

  const rowIsBorder = (y: number) => {
    let count = 0;
    for (let x = 0; x < width; x += 1) if (dark(y * width + x)) count += 1;
    return count >= width * SHARE;
  };

  const columnIsBorder = (x: number, top: number, bottom: number) => {
    const span = bottom - top;
    let count = 0;
    for (let y = top; y < bottom; y += 1) if (dark(y * width + x)) count += 1;
    return count >= span * SHARE;
  };

  const maxRows = Math.floor(height * MAX_SIDE);
  const maxColumns = Math.floor(width * MAX_SIDE);

  let top = 0;
  while (top < maxRows && rowIsBorder(top)) top += 1;

  let bottom = height;
  while (
    height - bottom < maxRows &&
    bottom > top + 1 &&
    rowIsBorder(bottom - 1)
  ) {
    bottom -= 1;
  }

  // Spalten nur über die Zeilen, die bleiben: Ein Balken oben und einer an
  // der Seite sind zusammen ein Rahmen, und die Ecke gehört zu beiden.
  let left = 0;
  while (left < maxColumns && columnIsBorder(left, top, bottom)) left += 1;

  let right = width;
  while (
    width - right < maxColumns &&
    right > left + 1 &&
    columnIsBorder(right - 1, top, bottom)
  ) {
    right -= 1;
  }

  if (top === 0 && left === 0 && bottom === height && right === width) {
    return null;
  }

  // An die Grenze gestoßen: kein Balken, sondern ein dunkles Bild.
  if (
    top >= maxRows ||
    height - bottom >= maxRows ||
    left >= maxColumns ||
    width - right >= maxColumns
  ) {
    return null;
  }

  // Ein Saum mehr an jeder beschnittenen Seite: Gemessen wird an einem
  // verkleinerten Bild, und dort ist die Zeile zwischen Balken und Foto ein
  // Mischton — zu hell für den Rand, aber in voller Größe ein dunkler Streifen.
  if (top > 0) top += 1;
  if (bottom < height) bottom -= 1;
  if (left > 0) left += 1;
  if (right < width) right -= 1;
  if (bottom <= top || right <= left) return null;

  return { x: left, y: top, width: right - left, height: bottom - top };
}
