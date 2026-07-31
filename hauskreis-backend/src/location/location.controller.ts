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
  UpdateLocationDto,
} from './dto/location.dto';
import { HauskreisParamsDto } from '../hauskreis/dto/hauskreis.dto';
import { Roles } from '../auth/roles.decorator';
import { ROLE_ADMIN } from '../auth/auth.types';
import { IfMatch } from '../common/http/if-match.decorator';
import {
  ApiConditionalWrite,
  ApiZodNoContent,
  ApiZodResponse,
} from '../common/http/api-response.decorator';
import {
  LocationListResponseDto,
  LocationResponseDto,
} from './dto/location-response.dto';
import type { IfMatchCondition } from '../common/http/etag';

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

  @Post()
  @Roles(ROLE_ADMIN)
  @ApiZodResponse(LocationResponseDto, { status: 201 })
  create(@Param() params: HauskreisParamsDto, @Body() dto: CreateLocationDto) {
    return this.locationService.create(params.hauskreisId, dto);
  }

  @Patch(':id')
  @Roles(ROLE_ADMIN)
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

  @Delete(':id')
  @ApiZodNoContent()
  @Roles(ROLE_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param() params: LocationParamsDto) {
    return this.locationService.remove(params.hauskreisId, params.id);
  }
}
