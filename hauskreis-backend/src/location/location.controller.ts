import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { LocationService } from './location.service';
import {
  CreateLocationDto,
  LocationParamsDto,
  ResolveAddressDto,
  UpdateLocationDto,
} from './dto/location.dto';
import { HauskreisParamsDto } from '../hauskreis/dto/hauskreis.dto';
import { IfMatch } from '../common/http/if-match.decorator';
import {
  ApiConditionalWrite,
  ApiZodNoContent,
  ApiZodResponse,
} from '../common/http/api-response.decorator';
import {
  LocationListResponseDto,
  LocationResponseDto,
  ResolveAddressResponseDto,
} from './dto/location-response.dto';
import type { IfMatchCondition } from '../common/http/etag';

/**
 * Orte darf jede:r anlegen, ändern und stilllegen — bewusst ohne Admin-Rolle.
 *
 * Ein Ort entsteht im Vorbeigehen: beim Eintragen eines Termins fällt auf,
 * dass der Treffpunkt fehlt. Wer dafür erst jemanden mit Admin-Rechten fragen
 * muss, trägt ihn gar nicht erst ein. Was wirklich schützenswert ist, ist die
 * Wohnung eines Menschen — und die lässt sich nicht von außen auflösen,
 * sondern nur über das eigene Profil (siehe `LocationService.remove`).
 */
@Controller('hauskreise/:hauskreisId/locations')
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Get()
  @ApiZodResponse(LocationListResponseDto, {
    description: 'Alle Orte, nach Namen sortiert',
  })
  findAll(@Param() params: HauskreisParamsDto) {
    return this.locationService.findAll(params.hauskreisId);
  }

  @Get(':id')
  @ApiZodResponse(LocationResponseDto)
  findOne(@Param() params: LocationParamsDto) {
    return this.locationService.findOne(params.hauskreisId, params.id);
  }

  /**
   * Gibt es diese Anschrift schon?
   *
   * `POST`, obwohl nichts entsteht: die Adresse gehört in den Rumpf und nicht
   * in die Adresszeile, wo sie in jedem Zugriffsprotokoll landen würde.
   */
  @Post('resolve-address')
  @HttpCode(HttpStatus.OK)
  @ApiZodResponse(ResolveAddressResponseDto, {
    description: 'Die Wohnung unter dieser Anschrift, oder null',
  })
  resolveAddress(
    @Param() params: HauskreisParamsDto,
    @Body() dto: ResolveAddressDto,
  ) {
    return this.locationService.resolveAddress(params.hauskreisId, dto.address);
  }

  @Post()
  @ApiZodResponse(LocationResponseDto, { status: 201 })
  create(@Param() params: HauskreisParamsDto, @Body() dto: CreateLocationDto) {
    return this.locationService.create(params.hauskreisId, dto);
  }

  @Patch(':id')
  @ApiZodResponse(LocationResponseDto)
  @ApiConditionalWrite()
  update(
    @Param() params: LocationParamsDto,
    @Body() dto: UpdateLocationDto,
    @IfMatch() ifMatch?: IfMatchCondition,
  ) {
    return this.locationService.update(
      params.hauskreisId,
      params.id,
      dto,
      ifMatch,
    );
  }

  /** Legt den Ort still; er bleibt an vergangenen Terminen sichtbar. */
  @Delete(':id')
  @ApiZodNoContent()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param() params: LocationParamsDto) {
    return this.locationService.remove(params.hauskreisId, params.id);
  }
}
