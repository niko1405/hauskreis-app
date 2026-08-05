import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';

/**
 * Kantenlänge des gespeicherten Bildes.
 *
 * 512 statt der 40 Pixel, mit denen ein Avatar meist dasteht: Retina-Displays
 * zeigen ihn doppelt so fein, das Profil zeigt ihn groß, und eine WebP-Datei in
 * dieser Größe wiegt rund 30 kB. Kleiner zu speichern spart nichts, was man
 * merkt, kostet aber Schärfe, die sich nicht zurückholen lässt.
 */
const SIZE = 512;

/** Was der Upload höchstens annimmt, bevor irgendetwas gelesen wird. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Profilbilder — Datei im Volume, Zeitstempel in der Datenbank.
 *
 * Bewusst **nicht** in der Datenbank: ein Bild ist kein Datensatz, den man
 * abfragt, sondern ein Blob, den man ausliefert. In einer Spalte machte er jede
 * Personen-Abfrage schwerer und jedes Backup größer, ohne dass irgendwer je
 * `WHERE bild = …` schriebe.
 *
 * Der Dateiname folgt der Id (`people/{id}.webp`) statt in einer Spalte zu
 * stehen. Ein Name in der Datenbank wäre eine zweite Wahrheit über etwas, das
 * ohnehin feststeht, und die beiden könnten auseinanderlaufen. Was stattdessen
 * gespeichert wird, ist `photoUpdatedAt` — der hängt als Query-Parameter an der
 * Bild-URL und erledigt das Zwischenspeichern im Browser.
 */
@Injectable()
export class PhotoService {
  private readonly logger = new Logger(PhotoService.name);
  private readonly directory: string;

  constructor(
    private readonly prisma: PrismaService,
    config: AppConfigService,
  ) {
    this.directory = resolve(config.get('UPLOAD_DIR'), 'people');
  }

  /**
   * Nimmt ein hochgeladenes Bild an — zugeschnitten, verkleinert, als WebP.
   *
   * Das Zuschneiden passiert hier und nicht im Browser: was ankommt, muss
   * ohnehin geprüft werden, und `sharp` scheitert an allem, was kein Bild ist.
   * Ein Browser, der sich das Zuschneiden sparte, könnte sonst 12 Megapixel
   * abliefern, und der Avatar wäre trotzdem 40 Pixel groß.
   *
   * `fit: 'cover'` mittig: ein Porträt wird zum Quadrat, indem links und rechts
   * etwas wegfällt — nicht, indem das Gesicht gestaucht wird.
   */
  async store(personId: string, data: Buffer): Promise<Date> {
    let webp: Buffer;

    try {
      webp = await sharp(data)
        .rotate() // EXIF-Ausrichtung anwenden, sonst liegen Handyfotos quer.
        .resize(SIZE, SIZE, { fit: 'cover', position: 'centre' })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw new BadRequestException(
        'Damit kann ich nichts anfangen — bitte ein Bild auswählen',
      );
    }

    await mkdir(this.directory, { recursive: true });
    await writeFile(this.pathFor(personId), webp);

    const photoUpdatedAt = new Date();
    await this.prisma.person.update({
      where: { id: personId },
      data: { photoUpdatedAt, version: { increment: 1 } },
    });

    return photoUpdatedAt;
  }

  /**
   * Liefert die Bytes samt Zeitstempel für den ETag.
   *
   * Fehlt die Datei, obwohl die Spalte gesetzt ist, wird die Spalte geleert
   * statt der Fehler durchgereicht: die App fragt das Bild nur an, weil der
   * Zeitstempel es versprochen hat, und ein 404 auf ein versprochenes Bild
   * bliebe für immer stehen. So heilt sich der Zustand beim nächsten Laden.
   */
  async read(personId: string): Promise<{ bytes: Buffer; updatedAt: Date }> {
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { photoUpdatedAt: true },
    });

    if (!person?.photoUpdatedAt) {
      throw new NotFoundException('Diese Person hat kein Profilbild');
    }

    try {
      return {
        bytes: await readFile(this.pathFor(personId)),
        updatedAt: person.photoUpdatedAt,
      };
    } catch {
      this.logger.warn(
        `Photo file for person ${personId} is missing; clearing the timestamp`,
      );
      await this.forget(personId);
      throw new NotFoundException('Diese Person hat kein Profilbild');
    }
  }

  /** Bild weg, Zeitstempel weg. Beides, oder die App zeigte ein totes Bild. */
  async remove(personId: string): Promise<void> {
    await rm(this.pathFor(personId), { force: true });
    await this.forget(personId);
  }

  private async forget(personId: string): Promise<void> {
    await this.prisma.person.updateMany({
      where: { id: personId, photoUpdatedAt: { not: null } },
      data: { photoUpdatedAt: null, version: { increment: 1 } },
    });
  }

  private pathFor(personId: string): string {
    return join(this.directory, `${personId}.webp`);
  }
}
