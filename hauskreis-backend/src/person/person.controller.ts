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
import { PersonService } from './person.service';
import {
  CreatePersonDto,
  InvitePersonDto,
  PersonParamsDto,
  UpdatePersonDto,
} from './dto/person.dto';
import { HauskreisParamsDto } from '../hauskreis/dto/hauskreis.dto';
import { Roles } from '../auth/roles.decorator';
import { ROLE_ADMIN } from '../auth/auth.types';

@Controller('hauskreise/:hauskreisId/people')
export class PersonController {
  constructor(private readonly personService: PersonService) {}

  @Get()
  findAll(@Param() params: HauskreisParamsDto) {
    return this.personService.findAll(params.hauskreisId);
  }

  @Get(':id')
  findOne(@Param() params: PersonParamsDto) {
    return this.personService.findOne(params.hauskreisId, params.id);
  }

  @Post()
  @Roles(ROLE_ADMIN)
  create(@Param() params: HauskreisParamsDto, @Body() dto: CreatePersonDto) {
    return this.personService.create(params.hauskreisId, dto);
  }

  @Post('invite')
  @Roles(ROLE_ADMIN)
  invite(@Param() params: HauskreisParamsDto, @Body() dto: InvitePersonDto) {
    return this.personService.invite(params.hauskreisId, dto);
  }

  @Patch(':id')
  update(@Param() params: PersonParamsDto, @Body() dto: UpdatePersonDto) {
    return this.personService.update(params.hauskreisId, params.id, dto);
  }

  @Delete(':id')
  @Roles(ROLE_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param() params: PersonParamsDto) {
    return this.personService.remove(params.hauskreisId, params.id);
  }
}
