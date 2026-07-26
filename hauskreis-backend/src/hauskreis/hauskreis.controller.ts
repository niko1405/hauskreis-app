import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { HauskreisService } from './hauskreis.service';
import { CreateHauskreisDto, HauskreisParamsDto } from './dto/hauskreis.dto';

@Controller('hauskreise')
export class HauskreisController {
  constructor(private readonly hauskreisService: HauskreisService) {}

  @Get()
  findAll() {
    return this.hauskreisService.findAll();
  }

  @Get(':hauskreisId')
  findOne(@Param() params: HauskreisParamsDto) {
    return this.hauskreisService.findOne(params.hauskreisId);
  }

  @Post()
  create(@Body() dto: CreateHauskreisDto) {
    return this.hauskreisService.create(dto);
  }
}
