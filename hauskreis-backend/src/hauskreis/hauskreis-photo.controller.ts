import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  HauskreisPhotoService,
  MAX_GROUP_PHOTO_BYTES,
} from './hauskreis-photo.service';
import { HauskreisParamsDto } from './dto/hauskreis.dto';
import {
  ApiZodNoContent,
  ApiZodResponse,
} from '../common/http/api-response.decorator';
import { PhotoResponseDto } from '../person/dto/person-response.dto';

/**
 * Das Gruppenbild.
 *
 * **Ohne `@HauskreisAdmin()`**, wie das Kopfbild und aus demselben Grund: Bei
 * neun Leuten ist das Bild der Gruppe keine Verwaltungsangelegenheit. Der Guard
 * prüft über die `hauskreisId` im Pfad, dass man dazugehört — mehr braucht es
 * nicht.
 *
 * Eigener Controller und nicht in `HauskreisController` dazu: Der arbeitet mit
 * JSON und ETags, dieser mit Multipart und Bytes. Zusammengelegt stünde in
 * einer Datei zweimal ein anderes Antwortformat.
 */
@Controller('hauskreise/:hauskreisId/photo')
export class HauskreisPhotoController {
  constructor(private readonly photos: HauskreisPhotoService) {}

  /**
   * Multipart und nicht JSON: Ein Bild als Base64 wäre ein Drittel größer und
   * liefe zudem gegen das 128-kB-Limit des JSON-Parsers.
   */
  @Post()
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
    @Param() params: HauskreisParamsDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_GROUP_PHOTO_BYTES }),
        ],
      }),
    )
    file: { buffer: Buffer },
  ): Promise<{ photoUpdatedAt: Date }> {
    // Der Zeitstempel zurück, nicht nur ein 204: Die App hängt ihn an die
    // Bild-URL, und ohne ihn zeigte der Browser noch das alte Bild.
    return {
      photoUpdatedAt: await this.photos.store(params.hauskreisId, file.buffer),
    };
  }

  @Delete()
  @ApiZodNoContent()
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param() params: HauskreisParamsDto): Promise<void> {
    await this.photos.remove(params.hauskreisId);
  }

  /**
   * Das Bild als Datei.
   *
   * `private` im Cache-Control und eine Stunde lang, wie bei den Profilbildern:
   * Die URL ändert sich mit dem Zeitstempel, ein neues Bild ist also sofort da.
   */
  @Get()
  @Header('Content-Type', 'image/webp')
  @Header('Cache-Control', 'private, max-age=3600')
  async find(
    @Param() params: HauskreisParamsDto,
    @Res() response: Response,
  ): Promise<void> {
    const { bytes, updatedAt } = await this.photos.read(params.hauskreisId);

    response.setHeader('ETag', `"${updatedAt.getTime()}"`);
    response.end(bytes);
  }
}
