import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseFilePipe,
  MaxFileSizeValidator,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import type { Response } from 'express';
import { PersonService } from './person.service';
import { PhotoService, MAX_UPLOAD_BYTES } from './photo.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  ApiZodNoContent,
  ApiZodResponse,
} from '../common/http/api-response.decorator';
import { PhotoResponseDto } from './dto/person-response.dto';
import { PersonParamsDto } from './dto/person.dto';

/**
 * Profilbilder — hochladen für sich selbst, ansehen für alle.
 *
 * Zwei Controller, weil es zwei verschiedene Fragen sind: `/api/me/photo`
 * schreibt das **eigene** Bild (wer gemeint ist, steht im Token), und
 * `…/people/:id/photo` liefert **irgendjemandes** Bild aus. Ein gemeinsamer
 * Pfad bräuchte eine Prüfung „bist du das selbst", die es hier gar nicht geben
 * muss.
 *
 * Beide hier zusammen, weil sie sich denselben Dienst und dieselben Kopfzeilen
 * teilen.
 */
@Controller()
export class PhotoController {
  constructor(
    private readonly photos: PhotoService,
    private readonly people: PersonService,
  ) {}

  /**
   * Das eigene Bild setzen.
   *
   * Multipart und nicht JSON: ein Bild als Base64 wäre ein Drittel größer und
   * liefe zudem gegen das 128-kB-Limit des JSON-Parsers, das für alles andere
   * genau richtig ist. Die Grenze setzt hier der Interceptor.
   */
  @Post('me/photo')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiZodResponse(PhotoResponseDto, { status: 201 })
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: MAX_UPLOAD_BYTES })],
      }),
    )
    file: { buffer: Buffer },
  ): Promise<{ photoUpdatedAt: Date }> {
    const person = await this.people.resolveForUser(user);

    // Der Zeitstempel zurück, nicht nur ein 204: die App hängt ihn an die
    // Bild-URL, und ohne ihn zeigte der Browser noch das alte Bild aus seinem
    // Zwischenspeicher.
    return { photoUpdatedAt: await this.photos.store(person.id, file.buffer) };
  }

  /** „Doch lieber Initialen." */
  @Delete('me/photo')
  @ApiZodNoContent()
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    const person = await this.people.resolveForUser(user);
    await this.photos.remove(person.id);
  }

  /**
   * Das Bild einer Person, als Datei.
   *
   * Der `ETag` kommt aus `photoUpdatedAt` und nicht aus dem Inhalt: derselbe
   * Zeitstempel steht in der Personen-Antwort, die App hängt ihn ohnehin an
   * die URL, und ein Hash über 30 kB zu rechnen beantwortet dieselbe Frage
   * teurer.
   *
   * `private` im Cache-Control, weil Gesichter einer Gruppe nichts sind, was
   * ein Zwischenspeicher unterwegs vorhalten soll. Eine Stunde reicht: die URL
   * ändert sich mit dem Zeitstempel, ein neues Bild ist also sofort da.
   */
  @Get('hauskreise/:hauskreisId/people/:id/photo')
  @Header('Content-Type', 'image/webp')
  @Header('Cache-Control', 'private, max-age=3600')
  async find(
    @Param() params: PersonParamsDto,
    @Res() response: Response,
  ): Promise<void> {
    // Über den Hauskreis geprüft: ohne das ließe sich mit einer geratenen Id
    // das Bild einer fremden Gruppe abrufen.
    await this.people.findOne(params.hauskreisId, params.id);

    const { bytes, updatedAt } = await this.photos.read(params.id);

    response.setHeader('ETag', `"${updatedAt.getTime()}"`);
    response.end(bytes);
  }
}
