import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { HeaderScreen } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';

/**
 * Maße des gespeicherten Bildes.
 *
 * Querformat, weil der Kopfbereich eines ist: die Leinwand ist höchstens 448
 * Pixel breit, auf großen Bildschirmen gut das Doppelte, und Retina verdoppelt
 * noch einmal. 1280×640 deckt das ab und wiegt als WebP rund 100 kB.
 */
const WIDTH = 1280;
const HEIGHT = 640;

/**
 * Was der Upload höchstens annimmt.
 *
 * Doppelt so viel wie beim Profilbild: dort schneidet man einen Kopf aus, hier
 * lädt jemand ein Landschaftsfoto vom Handy hoch, und das sprengt fünf Megabyte
 * regelmäßig. Verkleinert wird ohnehin hier.
 */
export const MAX_HEADER_BYTES = 10 * 1024 * 1024;

/**
 * Die Hintergrundbilder der vier Bildschirme.
 *
 * Wort für Wort nach dem Vorbild von `PhotoService`: Datei im Volume,
 * Zeitstempel in der Datenbank, ETag aus dem Zeitstempel. Was dort für Gesichter
 * gilt, gilt hier für Fotos vom letzten Sommer — ein Blob, den man ausliefert,
 * und keine Spalte, die jede Abfrage schwerer macht.
 *
 * **Eine Zeile je Bildschirm und Gruppe, und keine Zeile heißt „Vorgabe".** Das
 * Entfernen löscht die Zeile, statt ein Feld auf `null` zu setzen: es gibt
 * keinen Zustand „Bild ausdrücklich abgewählt", der sich von „noch keins" sinnvoll
 * unterscheiden ließe.
 */
@Injectable()
export class HeaderImageService {
  private readonly logger = new Logger(HeaderImageService.name);
  private readonly directory: string;

  constructor(
    private readonly prisma: PrismaService,
    config: AppConfigService,
  ) {
    this.directory = resolve(config.get('UPLOAD_DIR'), 'headers');
  }

  /** Welche der vier Bildschirme ein eigenes Bild haben, und seit wann. */
  async list(
    hauskreisId: string,
  ): Promise<{ screen: HeaderScreen; updatedAt: Date }[]> {
    return this.prisma.headerImage.findMany({
      where: { hauskreisId },
      select: { screen: true, updatedAt: true },
      orderBy: { screen: 'asc' },
    });
  }

  /**
   * Nimmt ein hochgeladenes Bild an — beschnitten, verkleinert, als WebP.
   *
   * `fit: 'cover'` mittig: aus einem Hochformat wird ein Streifen aus der Mitte,
   * nicht ein gestauchtes Bild. Wer den Ausschnitt genauer will, lädt ein
   * zugeschnittenes hoch — ein Zuschneide-Werkzeug im Browser wäre für vier
   * Bilder, die man einmal im Jahr wechselt, ein eigenes Projekt.
   */
  async store(
    hauskreisId: string,
    screen: HeaderScreen,
    data: Buffer,
  ): Promise<Date> {
    let webp: Buffer;

    try {
      webp = await sharp(data)
        .rotate() // EXIF-Ausrichtung anwenden, sonst liegen Handyfotos quer.
        .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'centre' })
        .webp({ quality: 80 })
        .toBuffer();
    } catch {
      throw new BadRequestException(
        'Damit kann ich nichts anfangen — bitte ein Bild auswählen',
      );
    }

    await mkdir(this.directory, { recursive: true });
    await writeFile(this.pathFor(hauskreisId, screen), webp);

    // `update` statt `create`, damit ein zweites Bild denselben Zeitstempel
    // hochzählt — daran hängt der Cache im Browser.
    const row = await this.prisma.headerImage.upsert({
      where: { hauskreisId_screen: { hauskreisId, screen } },
      create: { hauskreisId, screen },
      update: { updatedAt: new Date() },
      select: { updatedAt: true },
    });

    return row.updatedAt;
  }

  /**
   * Die Bytes samt Zeitstempel für den ETag.
   *
   * Fehlt die Datei, obwohl die Zeile steht, verschwindet die Zeile statt einen
   * Fehler durchzureichen: die App fragt das Bild nur an, weil die Liste es
   * versprochen hat, und ein 404 auf ein versprochenes Bild bliebe für immer
   * stehen. So heilt sich der Zustand beim nächsten Laden — der Verlauf ist
   * zurück, und niemand sucht nach einer kaputten Kopfzeile.
   */
  async read(
    hauskreisId: string,
    screen: HeaderScreen,
  ): Promise<{ bytes: Buffer; updatedAt: Date }> {
    const row = await this.prisma.headerImage.findUnique({
      where: { hauskreisId_screen: { hauskreisId, screen } },
      select: { updatedAt: true },
    });

    if (!row) {
      throw new NotFoundException('Für diesen Bildschirm gibt es kein Bild');
    }

    try {
      return {
        bytes: await readFile(this.pathFor(hauskreisId, screen)),
        updatedAt: row.updatedAt,
      };
    } catch {
      this.logger.warn(
        `Header image file for ${hauskreisId}/${screen} is missing; dropping the row`,
      );
      await this.forget(hauskreisId, screen);
      throw new NotFoundException('Für diesen Bildschirm gibt es kein Bild');
    }
  }

  /** Zurück zum mitgelieferten Verlauf. Datei weg, Zeile weg. */
  async remove(hauskreisId: string, screen: HeaderScreen): Promise<void> {
    await rm(this.pathFor(hauskreisId, screen), { force: true });
    await this.forget(hauskreisId, screen);
  }

  private async forget(
    hauskreisId: string,
    screen: HeaderScreen,
  ): Promise<void> {
    await this.prisma.headerImage.deleteMany({
      where: { hauskreisId, screen },
    });
  }

  private pathFor(hauskreisId: string, screen: HeaderScreen): string {
    return join(this.directory, `${hauskreisId}-${screen.toLowerCase()}.webp`);
  }
}
