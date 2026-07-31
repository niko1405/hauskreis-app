import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { HauskreisService } from './hauskreis.service';
import { CreateHauskreisDto, HauskreisParamsDto } from './dto/hauskreis.dto';
import { ApiZodResponse } from '../common/http/api-response.decorator';
import {
  HauskreisListResponseDto,
  HauskreisResponseDto,
} from './dto/hauskreis-response.dto';

@Controller('hauskreise')
export class HauskreisController {
  constructor(private readonly hauskreisService: HauskreisService) {}

  @Get()
  @ApiZodResponse(HauskreisListResponseDto)
  findAll() {
    return this.hauskreisService.findAll();
  }

  @Get(':hauskreisId')
  @ApiZodResponse(HauskreisResponseDto)
  findOne(@Param() params: HauskreisParamsDto) {
    return this.hauskreisService.findOne(params.hauskreisId);
  }

  @Post()
  @ApiZodResponse(HauskreisResponseDto, { status: 201 })
  create(@Body() dto: CreateHauskreisDto) {
    return this.hauskreisService.create(dto);
  }
}
