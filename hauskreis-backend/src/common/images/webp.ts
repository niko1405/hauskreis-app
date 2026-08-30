import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

/**
 * Ein hochgeladenes Bild als quadratisches WebP.
 *
 * Stand zweimal Wort für Wort da — beim Profilbild und beim Gruppenbild —
 * einschließlich der Fehlermeldung. Zwei Kopien derselben Rechnung sagen
 * irgendwann zwei verschiedene Dinge, und bei einer Meldung an Menschen wäre
 * das besonders albern.
 *
 * Das Zuschneiden passiert hier und nicht im Browser: Was ankommt, muss ohnehin
 * geprüft werden, und `sharp` scheitert an allem, was kein Bild ist. Ein
 * Browser, der sich das Zuschneiden spart, könnte sonst 12 Megapixel abliefern,
 * und der Avatar wäre trotzdem 40 Pixel groß.
 *
 * `fit: 'cover'` mittig: ein Porträt wird zum Quadrat, indem links und rechts
 * etwas wegfällt — nicht, indem das Gesicht gestaucht wird.
 *
 * Das Kopfbild (`HeaderImageService`) bleibt außen vor: 1280×640 ist kein
 * Quadrat, und eine Funktion mit zwei Kantenlängen wäre wieder nur `sharp` mit
 * anderen Worten.
 */
export async function toSquareWebp(
  data: Buffer,
  size: number,
  quality: number,
): Promise<Buffer> {
  try {
    return await sharp(data)
      .rotate() // EXIF-Ausrichtung anwenden, sonst liegen Handyfotos quer.
      .resize(size, size, { fit: 'cover', position: 'centre' })
      .webp({ quality })
      .toBuffer();
  } catch {
    throw new BadRequestException(
      'Damit kann ich nichts anfangen — bitte ein Bild auswählen',
    );
  }
}
