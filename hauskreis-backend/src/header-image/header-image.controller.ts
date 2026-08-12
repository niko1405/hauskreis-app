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
import { HeaderImageService, MAX_HEADER_BYTES } from './header-image.service';
import {
  HeaderImageListResponseDto,
  HeaderImageParamsDto,
  HeaderImageResponseDto,
  screenOf,
  slugOf,
} from './dto/header-image.dto';
import { HauskreisParamsDto } from '../hauskreis/dto/hauskreis.dto';
import {
  ApiZodNoContent,
  ApiZodResponse,
} from '../common/http/api-response.decorator';

/**
 * Die Hintergrundbilder im Kopfbereich von vier Bildschirmen.
 *
 * **Ein Bild gilt für die ganze Gruppe, und jede:r darf es tauschen.** Kein
 * `@HauskreisAdmin()` also: bei neun Leuten, die sich kennen, ist das
 * Hintergrundbild keine Verwaltungsangelegenheit — und ein Knopf, der für die
 * meisten nur eine Fehlermeldung erzeugt, wäre schlimmer als keiner.
 *
 * Zwei Wege zum selben Bild, wie bei den Profilbildern: die **Liste** sagt, für
 * welche Bildschirme überhaupt eins gesetzt ist und seit wann — daraus baut die
 * App ihren Cache-Schlüssel —, und die **Datei** kommt einzeln.
 */
@Controller('hauskreise/:hauskreisId/header-images')
export class HeaderImageController {
  constructor(private readonly images: HeaderImageService) {}

  /**
   * Ein Aufruf für alle vier.
   *
   * Vier einzelne Abfragen wären vier Runden über die Leitung für vier
   * Zeitstempel; die App braucht ohnehin alle, sobald sie den ersten Bildschirm
   * zeigt. Bildschirme ohne eigenes Bild fehlen schlicht — dort steht der
   * mitgelieferte Verlauf.
   */
  @Get()
  @ApiZodResponse(HeaderImageListResponseDto, {
    description:
      'Fuer welche Bildschirme ein eigenes Bild gesetzt ist, samt Zeitstempel',
  })
  async findAll(@Param() params: HauskreisParamsDto) {
    const rows = await this.images.list(params.hauskreisId);

    return rows.map((row) => ({
      screen: slugOf(row.screen),
      updatedAt: row.updatedAt,
    }));
  }

  /**
   * Das Bild selbst, als Datei.
   *
   * `private` im Cache-Control und eine Stunde Lebensdauer, wie beim
   * Profilbild: die URL trägt den Zeitstempel, ein neues Bild ist also sofort
   * da, und Fotos einer Gruppe sind nichts, was ein Zwischenspeicher unterwegs
   * vorhalten soll.
   */
  @Get(':screen')
  @Header('Content-Type', 'image/webp')
  @Header('Cache-Control', 'private, max-age=3600')
  async find(
    @Param() params: HeaderImageParamsDto,
    @Res() response: Response,
  ): Promise<void> {
    const { bytes, updatedAt } = await this.images.read(
      params.hauskreisId,
      screenOf(params.screen),
    );

    response.setHeader('ETag', `"${updatedAt.getTime()}"`);
    response.end(bytes);
  }

  /**
   * Ein neues Bild setzen.
   *
   * Multipart und nicht JSON: ein Bild als Base64 wäre ein Drittel größer und
   * liefe gegen das 128-kB-Limit des JSON-Parsers. Die Grenze setzt hier der
   * Interceptor.
   */
  @Post(':screen')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiZodResponse(HeaderImageResponseDto, { status: 201 })
  async upload(
    @Param() params: HeaderImageParamsDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: MAX_HEADER_BYTES })],
      }),
    )
    file: { buffer: Buffer },
  ) {
    const updatedAt = await this.images.store(
      params.hauskreisId,
      screenOf(params.screen),
      file.buffer,
    );

    return { screen: params.screen, updatedAt };
  }

  /** „Doch lieber wieder der Verlauf." */
  @Delete(':screen')
  @ApiZodNoContent()
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param() params: HeaderImageParamsDto): Promise<void> {
    await this.images.remove(params.hauskreisId, screenOf(params.screen));
  }
}
