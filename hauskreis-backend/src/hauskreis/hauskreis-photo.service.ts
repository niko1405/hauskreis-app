import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { toSquareWebp } from '../common/images/webp';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';

/** Wie beim Profilbild: groß genug für Retina, klein genug für 30 kB. */
const SIZE = 512;

/** Was der Upload höchstens annimmt, bevor irgendetwas gelesen wird. */
export const MAX_GROUP_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * Das Gruppenbild — Datei im Volume, Zeitstempel in der Datenbank.
 *
 * Dieselbe Bauart wie `PhotoService`, und das ist Absicht: Ein Bild ist kein
 * Datensatz, den man abfragt, sondern ein Blob, den man ausliefert. Der
 * Dateiname folgt der Id (`hauskreise/{id}.webp`), gespeichert wird nur
 * `photoUpdatedAt` — er hängt als Query-Parameter an der Bild-URL und erledigt
 * das Zwischenspeichern im Browser.
 *
 * Die Bildverarbeitung teilen sich beide über `common/images/webp.ts`. Nur die
 * Buchführung ist verschieden: Sie steht an `hauskreis` statt an `person`, und
 * `version` zieht mit, weil dieselbe Zeile über `If-Match` geschrieben wird.
 */
@Injectable()
export class HauskreisPhotoService {
  private readonly logger = new Logger(HauskreisPhotoService.name);
  private readonly directory: string;

  constructor(
    private readonly prisma: PrismaService,
    config: AppConfigService,
  ) {
    this.directory = resolve(config.get('UPLOAD_DIR'), 'hauskreise');
  }

  async store(hauskreisId: string, data: Buffer): Promise<Date> {
    const webp = await toSquareWebp(data, SIZE, 82);

    await mkdir(this.directory, { recursive: true });
    await writeFile(this.pathFor(hauskreisId), webp);

    const photoUpdatedAt = new Date();
    await this.prisma.hauskreis.update({
      where: { id: hauskreisId },
      data: { photoUpdatedAt, version: { increment: 1 } },
    });

    return photoUpdatedAt;
  }

  /**
   * Liefert die Bytes samt Zeitstempel für den ETag.
   *
   * Fehlt die Datei, obwohl die Spalte gesetzt ist, wird die Spalte geleert
   * statt der Fehler durchgereicht: Die App fragt das Bild nur an, weil der
   * Zeitstempel es versprochen hat, und ein 404 auf ein versprochenes Bild
   * bliebe für immer stehen.
   */
  async read(hauskreisId: string): Promise<{ bytes: Buffer; updatedAt: Date }> {
    const hauskreis = await this.prisma.hauskreis.findUnique({
      where: { id: hauskreisId },
      select: { photoUpdatedAt: true },
    });

    if (!hauskreis?.photoUpdatedAt) {
      throw new NotFoundException('Dieser Hauskreis hat kein Bild');
    }

    try {
      return {
        bytes: await readFile(this.pathFor(hauskreisId)),
        updatedAt: hauskreis.photoUpdatedAt,
      };
    } catch {
      this.logger.warn(
        `Photo file for hauskreis ${hauskreisId} is missing; clearing the timestamp`,
      );
      await this.forget(hauskreisId);
      throw new NotFoundException('Dieser Hauskreis hat kein Bild');
    }
  }

  /** Bild weg, Zeitstempel weg. Beides, oder die App zeigte ein totes Bild. */
  async remove(hauskreisId: string): Promise<void> {
    await rm(this.pathFor(hauskreisId), { force: true });
    await this.forget(hauskreisId);
  }

  private async forget(hauskreisId: string): Promise<void> {
    await this.prisma.hauskreis.updateMany({
      where: { id: hauskreisId, photoUpdatedAt: { not: null } },
      data: { photoUpdatedAt: null, version: { increment: 1 } },
    });
  }

  private pathFor(hauskreisId: string): string {
    return join(this.directory, `${hauskreisId}.webp`);
  }
}
